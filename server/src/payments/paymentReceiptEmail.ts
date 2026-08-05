import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';
import type { CheckoutProduct } from './types';

/** Format stored cent amounts as USD currency text, e.g. 5500 → "$55.00". */
export function formatUsdFromCents(cents: number | string | null | undefined): string {
  const raw = typeof cents === 'string' ? Number(cents) : Number(cents);
  const safeCents = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  const dollars = safeCents / 100;
  return `$${dollars.toFixed(2)}`;
}

export async function sendPaymentProcessedEmail(opts: {
  to: string;
  memberName: string;
  amountPaidCents: number;
  creditAppliedCents: number;
  listAmountCents?: number;
  planLabel: string;
  planSegment?: string | null;
}): Promise<void> {
  const amountCharged = formatUsdFromCents(opts.amountPaidCents);
  const creditApplied = formatUsdFromCents(opts.creditAppliedCents);
  const listCents =
    opts.listAmountCents != null
      ? opts.listAmountCents
      : Number(opts.amountPaidCents || 0) + Number(opts.creditAppliedCents || 0);
  const listPrice = formatUsdFromCents(listCents);
  const segment = opts.planSegment ? ` (${opts.planSegment})` : '';
  const planLine = `${opts.planLabel}${segment}`;

  const subject = `Payment processed: ${amountCharged} — ${opts.planLabel}`;
  const text = [
    `Hi ${opts.memberName},`,
    '',
    `Amount charged: ${amountCharged} is processed.`,
    '',
    `Plan purchased: ${planLine}`,
    `List price: ${listPrice}`,
    `Credit applied: ${creditApplied}`,
    `Amount charged this transaction: ${amountCharged}`,
    '',
    'Thank you.',
  ].join('\n');

  const html = `
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p><strong>Amount charged: ${escapeHtml(amountCharged)} is processed.</strong></p>
    <p><strong>Plan purchased:</strong> ${escapeHtml(planLine)}</p>
    <ul>
      <li>List price: ${escapeHtml(listPrice)}</li>
      <li>Credit applied: ${escapeHtml(creditApplied)}</li>
      <li>Amount charged this transaction: ${escapeHtml(amountCharged)}</li>
    </ul>
    <p>Thank you.</p>
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

export async function resolvePlanLabelForProduct(
  product: CheckoutProduct | undefined,
): Promise<{ planLabel: string; planSegment: string | null }> {
  if (!product) {
    return { planLabel: 'Club plan', planSegment: null };
  }
  if (product.kind === 'pay_per_visit') {
    return {
      planLabel: `Pay per visit (${product.clubDate})`,
      planSegment: null,
    };
  }
  if (product.kind === 'event') {
    return {
      planLabel: `Event registration (tournament ${product.tournamentId})`,
      planSegment: null,
    };
  }
  try {
    const { prisma } = await import('../index');
    const plan = await prisma.clubPlan.findUnique({
      where: { id: product.planId },
      select: { name: true, segment: true, familyKey: true },
    });
    if (plan) {
      return {
        planLabel: plan.name || product.familyKey,
        planSegment: product.planSegment || plan.segment,
      };
    }
  } catch (err) {
    logger.warn('Could not resolve plan label for receipt email', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {
    planLabel: product.familyKey || 'Club plan',
    planSegment: product.planSegment || null,
  };
}
