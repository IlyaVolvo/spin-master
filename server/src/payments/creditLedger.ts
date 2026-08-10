import { prisma } from '../index';
import { logger } from '../utils/logger';

export type AddPurchaseCreditInput = {
  memberId: number;
  amountCents: number;
  reason?: string;
  /** null/undefined = system */
  issuerMemberId?: number | null;
  externalRef?: string | null;
};

/**
 * Increment member purchaseCreditCents and append a ClubCredit audit row.
 * amountCents must be > 0.
 */
export async function addPurchaseCredit(input: AddPurchaseCreditInput): Promise<{
  purchaseCreditCents: number;
  creditId: number;
}> {
  const amountCents = Math.floor(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  const reason = typeof input.reason === 'string' ? input.reason : '';
  const issuerMemberId =
    input.issuerMemberId != null && Number.isInteger(input.issuerMemberId) && input.issuerMemberId > 0
      ? input.issuerMemberId
      : null;
  const externalRef =
    typeof input.externalRef === 'string' && input.externalRef.trim()
      ? input.externalRef.trim()
      : null;

  const [member, credit] = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: input.memberId },
      data: { purchaseCreditCents: { increment: amountCents } },
      select: { id: true, purchaseCreditCents: true },
    });
    const row = await tx.clubCredit.create({
      data: {
        memberId: input.memberId,
        issuerMemberId,
        amountCents,
        reason,
        externalRef,
      },
    });
    return [updated, row] as const;
  });

  logger.auditInfo('Purchase credit added', {
    memberId: input.memberId,
    creditId: credit.id,
    amountCents,
    reason,
    issuerMemberId,
    externalRef,
    purchaseCreditCents: member.purchaseCreditCents,
  });

  return { purchaseCreditCents: member.purchaseCreditCents, creditId: credit.id };
}

/**
 * Credit member when Stripe (or other PSP) reports SUCCEEDED after PENDING was wiped.
 * Idempotent on externalRef when a prior credit row exists for that ref.
 */
export async function creditPaidAfterCancel(opts: {
  memberId: number;
  amountCents: number;
  externalRef: string;
  providerId: string;
}): Promise<{ alreadyProcessed: boolean; creditId?: number }> {
  const externalRef = opts.externalRef.trim();
  if (!externalRef) {
    throw new Error('externalRef is required');
  }
  const existing = await prisma.clubCredit.findFirst({
    where: { externalRef },
    select: { id: true },
  });
  if (existing) {
    return { alreadyProcessed: true, creditId: existing.id };
  }

  const amountCents = Math.max(0, Math.floor(Number(opts.amountCents) || 0));
  if (amountCents <= 0) {
    logger.warn('Paid-after-cancel with zero amount — skipping credit', {
      memberId: opts.memberId,
      externalRef,
      providerId: opts.providerId,
    });
    return { alreadyProcessed: false };
  }

  const { creditId } = await addPurchaseCredit({
    memberId: opts.memberId,
    amountCents,
    issuerMemberId: null,
    externalRef,
    reason: `Paid after cancel (${opts.providerId})`,
  });

  return { alreadyProcessed: false, creditId };
}
