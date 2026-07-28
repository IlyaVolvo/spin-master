import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../index';
import { logger } from '../../utils/logger';
import { getActivePaymentProvider, listPaymentProvidersForAdmin } from '../getActivePaymentProvider';
import { listActivePlanFamilies, resolvePlanForMember, planChargeAmountCents } from '../resolvePlan';
import type { CheckoutProduct, PaymentInitiatedBy, PaymentMetadata } from '../types';

const router = express.Router();

function isAdmin(req: AuthRequest): boolean {
  return (req.member?.roles || []).includes('ADMIN');
}

/** GET /api/payments/providers — list registered providers for System Settings */
router.get('/providers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const providers = listPaymentProvidersForAdmin();
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
 * POST /api/payments/checkout
 * Body: { memberId?, familyKey?, kind?: 'plan'|'pay_per_visit', amountCents? }
 * Member self-pay or Admin-on-behalf (same flow).
 * Plan price is resolved from member.segment (fallback Regular).
 */
router.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bodyMemberId =
      req.body?.memberId != null ? Number(req.body.memberId) : NaN;
    const isKioskCheckin = req.kioskMode === true && req.kioskKind === 'checkin';
    const adminOnBehalf =
      isAdmin(req) && Number.isInteger(bodyMemberId) && bodyMemberId !== req.memberId;

    const initiatedBy: PaymentInitiatedBy =
      adminOnBehalf || isKioskCheckin ? 'ADMIN' : 'MEMBER';

    let targetMemberId: number;
    if (adminOnBehalf || isKioskCheckin) {
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

    const member = await prisma.member.findUnique({
      where: { id: targetMemberId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        segment: true,
        isActive: true,
      },
    });

    if (!member || !member.isActive) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (!member.email || !member.email.trim()) {
      return res.status(400).json({ error: 'Member must have an email address to pay' });
    }

    let product: CheckoutProduct;
    let amountCents: number;
    let purpose: string;

    const kind = req.body?.kind === 'pay_per_visit' ? 'pay_per_visit' : 'plan';

    if (kind === 'pay_per_visit') {
      amountCents = Number(req.body?.amountCents);
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        return res.status(400).json({ error: 'amountCents is required for pay_per_visit' });
      }
      const clubDate =
        typeof req.body?.clubDate === 'string' && req.body.clubDate
          ? req.body.clubDate
          : new Date().toLocaleDateString('en-CA', {
              timeZone: process.env.CLUB_TIMEZONE || 'UTC',
            });
      product = { kind: 'pay_per_visit', amountCents, clubDate };
      purpose = `Pay per visit ${clubDate}`;
    } else {
      const familyKey =
        typeof req.body?.familyKey === 'string' ? req.body.familyKey.trim() : '';
      if (!familyKey) {
        return res.status(400).json({ error: 'familyKey is required' });
      }
      let plan;
      try {
        plan = await resolvePlanForMember(familyKey, member.segment);
      } catch (err) {
        return res.status(400).json({
          error: err instanceof Error ? err.message : 'Plan not found for member segment',
        });
      }
      amountCents = planChargeAmountCents(plan);
      product = {
        kind: 'plan',
        familyKey: plan.familyKey,
        planId: plan.id,
        planSegment: plan.segment,
      };
      purpose = `Plan purchase: ${plan.name} (${plan.segment})`;
    }

    const openCourtesy = await prisma.clubVisit.findMany({
      where: {
        memberId: member.id,
        isCourtesy: true,
        courtesyClearedAt: null,
      },
      select: { id: true },
    });

    let payment = await prisma.clubPayment.findFirst({
      where: {
        memberId: member.id,
        status: 'PENDING',
      },
      orderBy: { recordedAt: 'desc' },
    });

    const metadata: PaymentMetadata = {
      kind: 'checkout',
      product,
      familyKey: product.kind === 'plan' ? product.familyKey : undefined,
      planId: product.kind === 'plan' ? product.planId : undefined,
      planSegment: product.kind === 'plan' ? product.planSegment : member.segment,
      initiatedBy,
      visitIds: openCourtesy.map((v) => v.id),
    };

    if (payment) {
      payment = await prisma.clubPayment.update({
        where: { id: payment.id },
        data: {
          amountCents,
          purpose,
          metadata,
        },
      });
    } else {
      payment = await prisma.clubPayment.create({
        data: {
          memberId: member.id,
          amountCents,
          purpose,
          status: 'PENDING',
          provider: 'manual',
          metadata,
        },
      });
    }

    if (openCourtesy.length > 0) {
      await prisma.clubVisit.updateMany({
        where: { id: { in: openCourtesy.map((v) => v.id) } },
        data: { obligationPaymentId: payment.id },
      });
    }

    const provider = getActivePaymentProvider();
    const result = await provider.startCheckout({
      memberId: member.id,
      memberEmail: member.email,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      amountCents,
      currency: 'USD',
      purpose,
      product,
      initiatedBy,
      paymentId: payment.id,
    });

    res.json({
      ...result,
      paymentId: payment.id,
      providerId: provider.id,
    });
  } catch (error) {
    logger.error('Checkout failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: error instanceof Error ? error.message : 'Checkout failed' });
  }
});

export default router;
