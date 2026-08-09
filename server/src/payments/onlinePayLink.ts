import { prisma } from '../index';
import { sendMail, getClientBaseUrl } from '../services/mailService';
import { getPaymentsConfig } from '../services/systemConfigService';
import { logger } from '../utils/logger';
import { emitPaymentUpdated } from '../services/socketService';
import { getCashPaymentProvider } from './getActivePaymentProvider';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import type { PaymentMetadata } from './types';

export type MailFailClass = 'irrecoverable' | 'recoverable';

export type DeliverPayLinkResult = {
  emailed: boolean;
  mailFailClass?: MailFailClass;
  mailFailMessage?: string;
  cashEscapeAvailableAt?: string;
};

function asMetadata(raw: unknown): PaymentMetadata {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as PaymentMetadata;
  }
  return {};
}

/** Classify SMTP / nodemailer failures for cash-escape timing. */
export function classifyMailSendError(err: unknown): MailFailClass {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code =
    err && typeof err === 'object' && 'responseCode' in err
      ? Number((err as { responseCode?: number }).responseCode)
      : err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';

  // Hard rejects / bad address
  if (
    /invalid.*(address|recipient)|mailbox.*(unavailable|not found)|user unknown|recipient rejected|550|551|552|553/.test(
      message,
    ) ||
    code === '550' ||
    code === 550
  ) {
    return 'irrecoverable';
  }
  // Transient / network
  if (
    /timeout|econn|etimedout|econnreset|econnrefused|temporar|rate.?limit|421|450|451|452|4\d\d/.test(
      message,
    ) ||
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET/.test(String(code))
  ) {
    return 'recoverable';
  }
  // Default: treat unknown send failures as recoverable (retry + delayed escape).
  return 'recoverable';
}

function escapeDelayMs(): number {
  const minutes = Math.max(
    0,
    Math.floor(Number(getPaymentsConfig().mailFailCashEscapeDelayMinutes) || 15),
  );
  return minutes * 60_000;
}

async function sendPayLinkEmail(opts: {
  to: string;
  memberName: string;
  purpose: string;
  amountCents: number;
  checkoutUrl: string;
}): Promise<void> {
  const amount = `$${(Math.max(0, opts.amountCents) / 100).toFixed(2)}`;
  const subject = `Complete your payment: ${amount}`;
  const text = [
    `Hi ${opts.memberName},`,
    '',
    `Please complete your payment for: ${opts.purpose}`,
    `Amount: ${amount}`,
    '',
    `Pay here: ${opts.checkoutUrl}`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>Please complete your payment for <strong>${escapeHtml(opts.purpose)}</strong>.</p>
    <p>Amount: <strong>${escapeHtml(amount)}</strong></p>
    <p><a href="${escapeHtml(opts.checkoutUrl)}">Pay now</a></p>
    <p style="color:#666;font-size:12px">If you did not request this, you can ignore this email.</p>
  `;
  await sendMail({ to: opts.to, subject, text, html });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * After Stripe (or other URL-based) online checkout: email the pay link.
 * On failure, annotate payment metadata for cash escape (immediate or delayed).
 */
export async function deliverOnlinePayLink(opts: {
  paymentId: number;
  memberEmail: string;
  memberName: string;
  purpose: string;
  amountCents: number;
  checkoutUrl: string;
}): Promise<DeliverPayLinkResult> {
  const trySend = async () => {
    await sendPayLinkEmail({
      to: opts.memberEmail,
      memberName: opts.memberName,
      purpose: opts.purpose,
      amountCents: opts.amountCents,
      checkoutUrl: opts.checkoutUrl,
    });
  };

  try {
    await trySend();
  } catch (firstErr) {
    const firstClass = classifyMailSendError(firstErr);
    if (firstClass === 'recoverable') {
      try {
        await trySend();
      } catch (secondErr) {
        return markMailFailure(opts.paymentId, secondErr, 'recoverable');
      }
    } else {
      return markMailFailure(opts.paymentId, firstErr, 'irrecoverable');
    }
  }

  const payment = await prisma.clubPayment.findUnique({ where: { id: opts.paymentId } });
  if (payment) {
    const meta = asMetadata(payment.metadata);
    const nextMeta: PaymentMetadata = { ...meta, payLinkEmailedAt: new Date().toISOString() };
    delete nextMeta.mailFailClass;
    delete nextMeta.mailFailMessage;
    delete nextMeta.cashEscapeAvailableAt;
    await prisma.clubPayment.update({
      where: { id: opts.paymentId },
      data: { metadata: nextMeta },
    });
  }

  logger.info('Online pay link emailed', {
    paymentId: opts.paymentId,
    to: opts.memberEmail,
  });
  return { emailed: true };
}

async function markMailFailure(
  paymentId: number,
  err: unknown,
  mailFailClass: MailFailClass,
): Promise<DeliverPayLinkResult> {
  const message = err instanceof Error ? err.message : String(err);
  const delayMs = mailFailClass === 'irrecoverable' ? 0 : escapeDelayMs();
  const cashEscapeAvailableAt = new Date(Date.now() + delayMs).toISOString();

  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (payment) {
    const meta = asMetadata(payment.metadata);
    await prisma.clubPayment.update({
      where: { id: paymentId },
      data: {
        metadata: {
          ...meta,
          mailFailClass,
          mailFailMessage: message.slice(0, 500),
          cashEscapeAvailableAt,
        },
      },
    });
    emitPaymentUpdated({
      id: payment.id,
      memberId: payment.memberId,
      status: payment.status,
      amountCents: payment.amountCents,
      provider: payment.provider,
      purpose: payment.purpose,
    });
  }

  logger.warn('Online pay link email failed', {
    paymentId,
    mailFailClass,
    cashEscapeAvailableAt,
    error: message,
  });

  return {
    emailed: false,
    mailFailClass,
    mailFailMessage: message,
    cashEscapeAvailableAt,
  };
}

/**
 * Cancel unpaid online Session (if any), then switch PENDING payment to cash desk.
 */
export async function escapeOnlinePaymentToCash(paymentId: number): Promise<{
  paymentId: number;
  providerId: string;
}> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PENDING') throw new Error('Payment is not pending');

  const meta = asMetadata(payment.metadata);
  if (meta.paymentMethod !== 'online' && payment.provider === 'cash') {
    throw new Error('Payment is already cash');
  }

  const escapeAt = meta.cashEscapeAvailableAt
    ? Date.parse(meta.cashEscapeAvailableAt)
    : NaN;
  // Allow escape if mail failed and delay elapsed, or if escape time is in the past/now.
  // Also allow if Admin forces after mail fail annotation exists.
  if (meta.mailFailClass) {
    if (Number.isFinite(escapeAt) && Date.now() < escapeAt) {
      throw new Error('Cash escape is not available yet — wait for the configured delay');
    }
  } else if (!meta.payLinkEmailedAt) {
    // No mail attempt recorded — still allow escape for stuck online PENDING with external session.
  }

  const providerId = payment.provider;
  if (payment.externalRef && paymentProviderRegistry.has(providerId)) {
    const provider = paymentProviderRegistry.get(providerId);
    if (provider.cancelPendingCheckout) {
      await provider.cancelPendingCheckout(payment.externalRef);
    }
  }

  const cash = getCashPaymentProvider();
  const externalRef = `cash_escape_${payment.id}_${Date.now()}`;
  const updated = await prisma.clubPayment.update({
    where: { id: payment.id },
    data: {
      provider: cash.id,
      externalRef,
      status: 'PENDING',
      metadata: {
        ...meta,
        paymentMethod: 'cash',
        escapedToCashAt: new Date().toISOString(),
        priorOnlineProvider: providerId,
        priorExternalRef: payment.externalRef,
      },
    },
  });

  emitPaymentUpdated({
    id: updated.id,
    memberId: updated.memberId,
    status: updated.status,
    amountCents: updated.amountCents,
    provider: updated.provider,
    purpose: updated.purpose,
  });

  logger.info('Escaped online payment to cash', {
    paymentId: payment.id,
    priorProvider: providerId,
  });

  return { paymentId: payment.id, providerId: cash.id };
}

/** Exported for tests / messages — not used at runtime beyond docs. */
export function paymentReturnPageHint(): string {
  return `${getClientBaseUrl()}/payment-return`;
}
