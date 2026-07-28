import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../../index';
import { confirmPayment } from '../../confirmPayment';
import { logger } from '../../../utils/logger';
import { getPaymentsConfig } from '../../../services/systemConfigService';
import type {
  ConfirmEvent,
  PaymentProvider,
  PaymentProviderSettingField,
  StartCheckoutInput,
  StartCheckoutResult,
} from '../../types';

const DEFAULT_MEAN_MS = 2500;
const DEFAULT_STDDEV_MS = 800;

/** Box–Muller normal sample. */
function sampleNormal(mean: number, stdDev: number): number {
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

function readTestDelaySettings(): { meanMs: number; stdDevMs: number } {
  const cfg = getPaymentsConfig().providers?.test;
  const meanMs = Math.max(0, Math.floor(Number(cfg?.confirmDelayMeanMs) || DEFAULT_MEAN_MS));
  const stdDevMs = Math.max(0, Math.floor(Number(cfg?.confirmDelayStdDevMs) || DEFAULT_STDDEV_MS));
  return { meanMs, stdDevMs };
}

/**
 * Test (dev) provider: leaves payment PENDING, then confirms via webhook path
 * after a Normal(μ, σ) delay (imitates a real PSP).
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = 'test';
  readonly displayName = 'Test (dev)';

  isUsable(): boolean {
    return true;
  }

  isOfferedForNewPayments(): boolean {
    return true;
  }

  getSettingsSchema(): PaymentProviderSettingField[] {
    return [
      {
        key: 'confirmDelayMeanMs',
        label: 'Confirm delay mean (ms)',
        type: 'number',
        min: 0,
        hint: 'Average delay before simulated webhook success',
      },
      {
        key: 'confirmDelayStdDevMs',
        label: 'Confirm delay stddev (ms)',
        type: 'number',
        min: 0,
        hint: 'Normal-distribution spread around the mean',
      },
    ];
  }

  getDefaultSettings(): Record<string, unknown> {
    return {
      confirmDelayMeanMs: DEFAULT_MEAN_MS,
      confirmDelayStdDevMs: DEFAULT_STDDEV_MS,
    };
  }

  validateSettings(value: unknown): Record<string, unknown> {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    return {
      confirmDelayMeanMs: Math.max(0, Math.floor(Number(raw.confirmDelayMeanMs) || DEFAULT_MEAN_MS)),
      confirmDelayStdDevMs: Math.max(0, Math.floor(Number(raw.confirmDelayStdDevMs) || DEFAULT_STDDEV_MS)),
    };
  }

  async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const externalRef = input.externalRef || `test_${input.paymentId}_${randomUUID()}`;

    await prisma.clubPayment.update({
      where: { id: input.paymentId },
      data: {
        provider: this.id,
        externalRef,
        status: 'PENDING',
        amountCents: input.amountCents,
      },
    });

    const { meanMs, stdDevMs } = readTestDelaySettings();
    const delayMs = Math.max(0, Math.round(sampleNormal(meanMs, stdDevMs)));

    setTimeout(() => {
      void confirmPayment({
        providerId: this.id,
        externalRef,
        status: 'SUCCEEDED',
        amountCents: input.amountCents,
        raw: { simulatedWebhook: true, delayMs },
      }).catch((err) => {
        logger.error('Test provider delayed confirm failed', {
          externalRef,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, delayMs);

    return {
      paymentId: input.paymentId,
      externalRef,
      instructions: `Test payment pending; webhook success expected in ~${delayMs}ms.`,
      confirmedImmediately: false,
    };
  }

  async parseWebhook(req: Request): Promise<ConfirmEvent | null> {
    const body = req.body || {};
    const externalRef = typeof body.externalRef === 'string' ? body.externalRef : null;
    const status =
      body.status === 'SUCCEEDED' || body.status === 'FAILED' || body.status === 'CANCELLED'
        ? body.status
        : null;
    if (!externalRef || !status) return null;
    return {
      providerId: this.id,
      externalRef,
      status,
      amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
      raw: body,
    };
  }

  async reconcilePending(payment: {
    id: number;
    externalRef: string | null;
    metadata: unknown;
  }): Promise<ConfirmEvent | null> {
    if (!payment.externalRef) return null;
    return {
      providerId: this.id,
      externalRef: payment.externalRef,
      status: 'SUCCEEDED',
    };
  }
}
