import express, { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { paymentProviderRegistry } from '../PaymentProviderRegistry';
import { confirmPayment } from '../confirmPayment';

const router = express.Router();

/**
 * POST /api/payments/webhook/:providerId
 * Provider-specific webhook; parses via plugin then shared confirmPayment.
 */
router.post('/webhook/:providerId', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId || '');
    if (!paymentProviderRegistry.has(providerId)) {
      return res.status(404).json({ error: 'Unknown payment provider' });
    }
    const provider = paymentProviderRegistry.get(providerId);
    const event = await provider.parseWebhook(req);
    if (!event) {
      return res.status(400).json({ error: 'Unrecognized webhook payload' });
    }
    const result = await confirmPayment(event);
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('Payment webhook failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
