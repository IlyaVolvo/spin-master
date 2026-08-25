import express, { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getClubDate } from '../utils/clubDate';
import { loadPresentMembers } from '../payments/presentMembers';
import { loadPublicHostDuty } from '../payments/publicHostDuty';
import { getPresenceBoardVersion } from '../payments/presenceBoardVersion';
import { isPresentBoardEnabled } from '../services/systemConfigService';

const router = express.Router();

router.get('/version', (_req: Request, res: Response) => {
  if (!isPresentBoardEnabled()) {
    return res.status(404).json({ error: 'Present board not available' });
  }
  res.json({
    clubDate: getClubDate(),
    version: getPresenceBoardVersion(),
  });
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    if (!isPresentBoardEnabled()) {
      return res.status(404).json({ error: 'Present board not available' });
    }

    const snapshot = await loadPresentMembers();
    const hosts = await loadPublicHostDuty();
    const arrivedHostIds = new Set(
      hosts.filter((slot) => slot.status === 'arrived' && slot.memberId != null).map((slot) => slot.memberId as number),
    );
    const members = snapshot.members
      .filter((row) => !arrivedHostIds.has(row.memberId))
      .map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        checkInAt: row.checkInAt,
      }));

    res.json({
      clubDate: snapshot.clubDate,
      version: getPresenceBoardVersion(),
      presentCount: members.length,
      hosts: hosts.map(({ memberId: _memberId, ...host }) => host),
      members,
    });
  } catch (error) {
    logger.error('Error loading public present board', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
