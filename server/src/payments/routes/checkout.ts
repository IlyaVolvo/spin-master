import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../index';
import { logger } from '../../utils/logger';
import { getActivePaymentProvider, listPaymentProvidersForAdmin } from '../getActivePaymentProvider';
import { listActivePlanFamilies, resolvePlanForMember, planChargeAmountCents } from '../resolvePlan';
import { runMemberCheckout } from '../runCheckout';
import { paymentProviderRegistry } from '../PaymentProviderRegistry';
import { getPaymentsConfig } from '../../services/systemConfigService';
import type { PaymentInitiatedBy } from '../types';
import { getKioskKind, isKioskMode } from '../../utils/kioskMode';
import { hasCheckinPaymentUnlock } from '../../utils/checkinPaymentUnlock';

const router = express.Router();

function isAdmin(req: AuthRequest): boolean {
  return (req.member?.roles || []).includes('ADMIN');
}

/** Check-in kiosk is staffed by an admin; allow paying for a named member there. */
function isCheckinKioskStaff(req: AuthRequest): boolean {
  return isKioskMode(req) && getKioskKind(req) === 'checkin' && isAdmin(req);
}

/** GET /api/payments/providers — list registered providers for System Settings */
router.get('/providers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const cfg = getPaymentsConfig();
    const providers = listPaymentProvidersForAdmin().map((p) => {
      const provider = paymentProviderRegistry.get(p.id);
      return {
        ...p,
        settingsSchema: provider.getSettingsSchema?.() ?? [],
        settings: cfg.providers?.[p.id] ?? provider.getDefaultSettings?.() ?? {},
      };
    });
    let activeId = '';
    try {
      activeId = getActivePaymentProvider().id;
    } catch {
      activeId = '';
    }
    res.json({ providers, activeProviderId: activeId });
  } catch (error) {
    logger.error('List providers failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

/** GET /api/payments/plans — distinct active plan families for checkout */
router.get('/plans', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await listActivePlanFamilies();
    res.json({ plans });
  } catch (error) {
    logger.error('List checkout plans failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

/**
 * GET /api/payments/plans/for-member/:memberId — families with resolved price for segment
 */
router.get('/plans/for-member/:memberId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    if (!isAdmin(req) && req.memberId !== memberId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { segment: true, purchaseCreditCents: true },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const families = await listActivePlanFamilies();
    const plans = [];
    for (const f of families) {
      try {
        const plan = await resolvePlanForMember(f.familyKey, member.segment);
        const listAmountCents = planChargeAmountCents(plan);
        if (listAmountCents <= 0) continue;
        plans.push({
          familyKey: f.familyKey,
          name: plan.name,
          kind: plan.kind,
          segment: plan.segment,
          planId: plan.id,
          listAmountCents,
          creditPreviewCents: Math.min(member.purchaseCreditCents || 0, listAmountCents),
          chargePreviewCents: Math.max(
            0,
            listAmountCents - Math.min(member.purchaseCreditCents || 0, listAmountCents),
          ),
          durationUnit: plan.durationUnit,
          durationValue: plan.durationValue,
          visitCount: plan.visitCount,
          priceCents: plan.priceCents,
        });
      } catch {
        // skip families without resolvable row
      }
    }
    res.json({
      plans,
      purchaseCreditCents: member.purchaseCreditCents,
      memberSegment: member.segment,
    });
  } catch (error) {
    logger.error('List plans for member failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

/** GET /api/payments/:paymentId — poll payment status */
router.get('/:paymentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }
    const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!isAdmin(req) && payment.memberId !== req.memberId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({
      id: payment.id,
      status: payment.status,
      amountCents: payment.amountCents,
      provider: payment.provider,
      externalRef: payment.externalRef,
      purpose: payment.purpose,
      memberId: payment.memberId,
    });
  } catch (error) {
    logger.error('Get payment failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

/**
 * POST /api/payments/checkout
 * Body: { memberId?, familyKey?, kind?, amountCents?, autoRenew?, method?: 'cash'|'online', startDate? }
 */
router.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bodyMemberId =
      req.body?.memberId != null ? Number(req.body.memberId) : NaN;
    const checkinKioskStaff = isCheckinKioskStaff(req);

    if (req.kioskMode === true && !checkinKioskStaff) {
      return res.status(403).json({
        error:
          'Purchases cannot be started from this kiosk. Use the Plan page after full login, or ask an administrator.',
      });
    }

    if (checkinKioskStaff) {
      if (!Number.isInteger(bodyMemberId) || bodyMemberId < 1) {
        return res.status(400).json({ error: 'memberId is required' });
      }
      if (!hasCheckinPaymentUnlock(req, bodyMemberId)) {
        return res.status(403).json({
          error: 'Member password required to start payment from check-in.',
        });
      }
    }

    const adminOnBehalf =
      (isAdmin(req) || checkinKioskStaff) &&
      Number.isInteger(bodyMemberId) &&
      bodyMemberId !== req.memberId;

    const initiatedBy: PaymentInitiatedBy = adminOnBehalf ? 'ADMIN' : 'MEMBER';

    let targetMemberId: number;
    if (adminOnBehalf) {
      if (!Number.isInteger(bodyMemberId) || bodyMemberId < 1) {
        return res.status(400).json({ error: 'memberId is required' });
      }
      targetMemberId = bodyMemberId;
    } else {
      targetMemberId = Number(req.memberId);
    }

    if (!Number.isInteger(targetMemberId) || targetMemberId < 1) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    if (initiatedBy === 'MEMBER' && targetMemberId !== req.memberId) {
      return res.status(403).json({ error: 'Cannot pay for another member' });
    }

    const methodRaw = req.body?.method;
    const method =
      methodRaw === 'cash' || methodRaw === 'online' ? methodRaw : undefined;

    const kindRaw = req.body?.kind;
    const kind =
      kindRaw === 'pay_per_visit'
        ? 'pay_per_visit'
        : kindRaw === 'event'
          ? 'event'
          : 'plan';

    if (kind === 'event') {
      const { runEventCheckout } = await import('../eventPayment');
      const tournamentId = Number(req.body?.tournamentId);
      const registrationId = Number(req.body?.registrationId);
      if (!Number.isInteger(tournamentId) || tournamentId < 1) {
        return res.status(400).json({ error: 'tournamentId is required' });
      }
      if (!Number.isInteger(registrationId) || registrationId < 1) {
        return res.status(400).json({ error: 'registrationId is required' });
      }

      const registration = await prisma.tournamentRegistration.findUnique({
        where: { id: registrationId },
        include: { tournament: true },
      });
      if (!registration || registration.tournamentId !== tournamentId) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      if (registration.memberId !== targetMemberId) {
        return res.status(403).json({ error: 'Registration does not belong to this member' });
      }
      if (!registration.tournament.isEvent || registration.tournament.eventPriceCents == null) {
        return res.status(400).json({ error: 'Tournament is not a paid event' });
      }
      if (registration.status === 'REGISTERED') {
        return res.status(400).json({ error: 'Already registered for this event' });
      }
      if (registration.status === 'DECLINED') {
        return res.status(400).json({ error: 'Invitation was declined' });
      }

      const result = await runEventCheckout({
        memberId: targetMemberId,
        tournamentId,
        registrationId,
        eventPriceCents: registration.tournament.eventPriceCents,
        tournamentName: registration.tournament.name,
        initiatedBy,
        method,
      });

      if (registration.status !== 'PENDING') {
        await prisma.tournamentRegistration.update({
          where: { id: registrationId },
          data: {
            status: 'PENDING',
            rejectedAt: null,
            rejectionReason: null,
            registeredAt: null,
          },
        });
      }

      return res.json(result);
    }

    // Admin / check-in staff paying for another member: cash only (no online on their behalf).
    if (
      method === 'online' &&
      (isAdmin(req) || checkinKioskStaff) &&
      targetMemberId !== req.memberId
    ) {
      return res.status(403).json({
        error: 'Administrators acting on behalf can only record cash payments',
      });
    }

    // Member-chosen cash → PENDING (admin clears later).
    // Admin/kiosk cash on a member's behalf → PAID immediately.
    const actingOnBehalf =
      targetMemberId !== req.memberId && (isAdmin(req) || checkinKioskStaff);
    const confirmCashImmediately =
      method === 'cash' && (checkinKioskStaff || actingOnBehalf);

    const result = await runMemberCheckout({
      memberId: targetMemberId,
      kind: kind === 'pay_per_visit' ? 'pay_per_visit' : 'plan',
      familyKey: typeof req.body?.familyKey === 'string' ? req.body.familyKey : undefined,
      amountCents: req.body?.amountCents != null ? Number(req.body.amountCents) : undefined,
      clubDate: typeof req.body?.clubDate === 'string' ? req.body.clubDate : undefined,
      startDate: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
      autoRenew: req.body?.autoRenew === true,
      initiatedBy,
      method,
      confirmCashImmediately,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed';
    logger.error('Checkout failed', { error: message });
    const status =
      message.includes('future plan') ||
      message.includes('familyKey') ||
      message.includes('email') ||
      message.includes('consent') ||
      message.includes('trial') ||
      message.includes('Online payment') ||
      message.includes('Cash payment') ||
      message.includes('Immediate cash') ||
      message.includes('Pay per visit')
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
