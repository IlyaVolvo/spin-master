import express, { Response } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../utils/adminAccess';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { buildClubArchive, importClubArchive, parseClubArchive } from '../services/clubArchiveService';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

type UploadedArchiveFile = {
  buffer: Buffer;
};

router.use(authenticate);
router.use(requireAdmin);

/** Export members + completed tournaments as a club archive JSON document. */
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const archive = await buildClubArchive(prisma);
    logger.info('Club archive exported', {
      memberId: req.memberId,
      members: archive.members.length,
      tournaments: archive.tournaments.length,
      standaloneMatches: archive.standaloneMatches.length,
    });
    res.json(archive);
  } catch (error) {
    logger.error('Club archive export failed', {
      error: error instanceof Error ? error.message : String(error),
      memberId: req.memberId,
    });
    res.status(500).json({ error: 'Failed to export club archive' });
  }
});

/** Import club archive into an empty tournament/match DB (Admin only). */
router.post('/import', upload.single('file'), async (req: AuthRequest & { file?: UploadedArchiveFile }, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Archive file is required' });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Archive file must be valid JSON' });
    }

    let archive;
    try {
      archive = parseClubArchive(parsedJson);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid club archive',
      });
    }

    const result = await importClubArchive(prisma, archive);
    logger.info('Club archive imported', {
      memberId: req.memberId,
      ...result,
    });
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Club archive import failed', {
      error: message,
      memberId: req.memberId,
    });
    const isGuard = message.includes('requires an empty');
    res.status(isGuard ? 409 : 500).json({ error: message });
  }
});

export default router;
