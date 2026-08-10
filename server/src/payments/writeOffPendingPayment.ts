import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { emitPaymentUpdated } from '../services/socketService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';

export function normalizeMemberConfirmName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function memberDisplayName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`.trim().replace(/\s+/g, ' ');
}

export type WriteOffPendingPaymentInput = {
  paymentId: number;
  adminMemberId: number;
  /** Typed member full name (must match payment member). */
  memberNameConfirm: string;
  /** Admin account password (anti-impersonation). */
  password: string;
};

/**
 * Admin write-off: PENDING → WRITTEN_OFF (terminal).
 * Does not grant entitlement. Online Checkout Sessions are expired when possible.
 * Later Stripe/reconcile success must not revive this row — use purchase credit instead.
 */
export async function writeOffPendingPayment(input: WriteOffPendingPaymentInput): Promise<{
  paymentId: number;
  status: 'WRITTEN_OFF';
  memberId: number;
}> {
  const password = typeof input.password === 'string' ? input.password : '';
  const nameConfirm = typeof input.memberNameConfirm === 'string' ? input.memberNameConfirm : '';
  if (!password.trim()) {
    throw new Error('Password is required');
  }
  if (!nameConfirm.trim()) {
    throw new Error('Member name confirmation is required');
  }

  const admin = await prisma.member.findUnique({
    where: { id: input.adminMemberId },
    select: { id: true, password: true, roles: true, isActive: true },
  });
  if (!admin || !admin.isActive) {
    throw new Error('Admin account not found');
  }
  const roles = Array.isArray(admin.roles) ? admin.roles.map(String) : [];
  if (!roles.includes('ADMIN')) {
    throw new Error('Admin access required');
  }
  if (!admin.password) {
    throw new Error('Admin password is not set');
  }
  const passwordOk = await bcrypt.compare(password, admin.password);
  if (!passwordOk) {
    throw new Error('Incorrect password');
  }

  const payment = await prisma.clubPayment.findUnique({
    where: { id: input.paymentId },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!payment) {
    throw new Error('Payment not found');
  }
  if (payment.status !== 'PENDING') {
    throw new Error('Only pending payments can be written off');
  }

  const expectedName = memberDisplayName(payment.member);
  if (normalizeMemberConfirmName(nameConfirm) !== normalizeMemberConfirmName(expectedName)) {
    throw new Error(`Type the member name exactly to confirm: ${expectedName}`);
  }

  if (payment.externalRef && paymentProviderRegistry.has(payment.provider)) {
    const provider = paymentProviderRegistry.get(payment.provider);
    if (provider.cancelPendingCheckout) {
      try {
        await provider.cancelPendingCheckout(payment.externalRef);
      } catch (err) {
        // Session may already be complete/expired — still write off the ledger row.
        logger.warn('Write-off: cancelPendingCheckout failed', {
          paymentId: payment.id,
          provider: payment.provider,
          externalRef: payment.externalRef,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const prevMeta =
    payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};

  const updated = await prisma.clubPayment.update({
    where: { id: payment.id },
    data: {
      status: 'WRITTEN_OFF',
      metadata: {
        ...prevMeta,
        writtenOffAt: new Date().toISOString(),
        writtenOffByMemberId: input.adminMemberId,
        writtenOffMemberNameConfirm: expectedName,
      },
    },
  });

  logger.auditInfo('Payment written off', {
    paymentId: updated.id,
    memberId: updated.memberId,
    provider: updated.provider,
    amountCents: updated.amountCents,
    writtenOffByMemberId: input.adminMemberId,
  });

  emitPaymentUpdated({
    id: updated.id,
    memberId: updated.memberId,
    status: updated.status,
    amountCents: updated.amountCents,
    provider: updated.provider,
    purpose: updated.purpose,
  });

  return {
    paymentId: updated.id,
    status: 'WRITTEN_OFF',
    memberId: updated.memberId,
  };
}
