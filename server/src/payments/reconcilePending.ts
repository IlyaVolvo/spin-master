import { prisma } from '../index';
import { logger } from '../utils/logger';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import { confirmPayment } from './confirmPayment';

/**
 * Backup path when webhooks were missed: ask each provider about PENDING payments.
 */
export async function reconcilePendingPayments(limit = 50): Promise<{
  checked: number;
  confirmed: number;
  failed: number;
}> {
  const pending = await prisma.clubPayment.findMany({
    where: { status: 'PENDING' },
    orderBy: { recordedAt: 'asc' },
    take: limit,
  });

  let confirmed = 0;
  let failed = 0;

  for (const payment of pending) {
    if (!paymentProviderRegistry.has(payment.provider)) {
      continue;
    }
    const provider = paymentProviderRegistry.get(payment.provider);
    try {
      const event = await provider.reconcilePending({
        id: payment.id,
        externalRef: payment.externalRef,
        metadata: payment.metadata,
      });
      if (!event) continue;
      const result = await confirmPayment(event);
      if (event.status === 'SUCCEEDED' && !result.alreadyProcessed) confirmed += 1;
      if (event.status === 'FAILED') failed += 1;
    } catch (err) {
      logger.error('reconcilePending failed for payment', {
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
    }
  }

  return { checked: pending.length, confirmed, failed };
}
