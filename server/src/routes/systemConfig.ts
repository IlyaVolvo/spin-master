import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPublicSystemConfig, getSystemConfig, updateSystemConfig } from '../services/systemConfigService';
import { requireAdmin } from '../utils/adminAccess';
import { logger } from '../utils/logger';

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json(getPublicSystemConfig());
});

router.get('/system-config', authenticate, requireAdmin, (_req: AuthRequest, res) => {
  res.json(getSystemConfig());
});

router.patch('/system-config', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const config = await updateSystemConfig(req.body);
    res.json(config);
  } catch (error) {
    logger.warn('System configuration update rejected', {
      error: error instanceof Error ? error.message : String(error),
      memberId: req.memberId,
    });
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid system configuration' });
  }
});

export default router;
