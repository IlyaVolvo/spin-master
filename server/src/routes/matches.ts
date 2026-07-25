import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { processMatchRating } from '../services/matchRatingService';
import { getTournamentRulesConfig } from '../services/systemConfigService';
import { authorizeStandaloneMatchScoreWrite, matchAuthFailureJson } from '../utils/matchScoreAuthorization';
import { isOrganizer } from '../utils/organizerAccess';

const router = express.Router();

router.use(authenticate);

/** Minimal match rows for Players “games played” — all rows in `matches`, any tournamentId (or none). */
router.get('/player-game-rows', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.match.findMany({
      select: {
        id: true,
        member1Id: true,
        member2Id: true,
        player1Sets: true,
        player2Sets: true,
        player1Forfeit: true,
        player2Forfeit: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });

    res.json({
      matches: rows.map((m) => ({
        id: m.id,
        member1Id: m.member1Id,
        member2Id: m.member2Id,
        player1Sets: m.player1Sets,
        player2Sets: m.player2Sets,
        player1Forfeit: m.player1Forfeit,
        player2Forfeit: m.player2Forfeit,
        updatedAt: m.updatedAt.toISOString(),
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('Error fetching match rows for player game counts', { error });
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Helper uses shared isOrganizer (respects kiosk mode)

function validateConfiguredMatchScore(player1Sets: number, player2Sets: number, player1Forfeit = false, player2Forfeit = false): string | null {
  const { matchScore } = getTournamentRulesConfig();
  if (player1Sets < matchScore.min || player1Sets > matchScore.max || player2Sets < matchScore.min || player2Sets > matchScore.max) {
    return `Scores must be between ${matchScore.min} and ${matchScore.max}`;
  }
  if (!matchScore.allowEqualScores && !player1Forfeit && !player2Forfeit && player1Sets === player2Sets) {
    return 'Scores cannot be equal. One player must win.';
  }
  return null;
}

// Get all standalone matches (matches without tournament association)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId: null, // Only standalone matches
      },
      include: {
        tournament: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Fetch member details for each match
    const matchesWithMembers = await Promise.all(
      matches.map(async (match) => {
        const member1 = await prisma.member.findUnique({
          where: { id: match.member1Id },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true,
          },
        });

        const member2 = match.member2Id ? await prisma.member.findUnique({
          where: { id: match.member2Id },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true,
          },
        }) : null;

        // Get rating history for this match
        const ratingHistory = await prisma.ratingHistory.findMany({
          where: {
            matchId: match.id,
          },
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        // Map rating changes to players
        const player1RatingHistory = ratingHistory.find(rh => rh.memberId === match.member1Id);
        const player2RatingHistory = ratingHistory.find(rh => rh.memberId === match.member2Id);

        return {
          ...match,
          member1,
          member2,
          player1RatingBefore: player1RatingHistory ? (player1RatingHistory.rating ?? 0) - (player1RatingHistory.ratingChange ?? 0) : null,
          player1RatingChange: player1RatingHistory?.ratingChange ?? null,
          player2RatingBefore: player2RatingHistory ? (player2RatingHistory.rating ?? 0) - (player2RatingHistory.ratingChange ?? 0) : null,
          player2RatingChange: player2RatingHistory?.ratingChange ?? null,
        };
      })
    );

    res.json(matchesWithMembers);
  } catch (error) {
    logger.error('Error fetching standalone matches', { error });
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Create a standalone match with final scores
router.post('/', [
  body('member1Id').isInt({ min: 1 }),
  body('member2Id').isInt({ min: 1 }),
  body('player1Sets').isInt({ min: 0 }),
  body('player2Sets').isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
  body('member1Pin').optional().isString(),
  body('member2Pin').optional().isString(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit, member1Pin, member2Pin } = req.body;

    // Validate that member1Id and member2Id are different
    if (member1Id === member2Id) {
      return res.status(400).json({ error: 'Cannot create a match with the same player twice' });
    }

    // Check if both players exist
    const [member1, member2] = await Promise.all([
      prisma.member.findUnique({ where: { id: member1Id } }),
      prisma.member.findUnique({ where: { id: member2Id } }),
    ]);

    if (!member1 || !member2) {
      return res.status(404).json({ error: 'One or both players not found' });
    }

    const scoreAuth = await authorizeStandaloneMatchScoreWrite(
      prisma,
      req,
      member1Id,
      member2Id,
      member1Pin,
      member2Pin,
      player1Forfeit,
      player2Forfeit
    );
    if (!scoreAuth.ok) {
      return res.status(scoreAuth.status).json(matchAuthFailureJson(scoreAuth));
    }

    const finalPlayer1Forfeit = player1Forfeit || false;
    const finalPlayer2Forfeit = player2Forfeit || false;
    const scoreError = validateConfiguredMatchScore(player1Sets, player2Sets, finalPlayer1Forfeit, finalPlayer2Forfeit);
    if (scoreError) {
      return res.status(400).json({ error: scoreError });
    }

    // Create the standalone match
    const match = await prisma.match.create({
      data: {
        tournamentId: null, // Standalone match
        member1Id,
        member2Id,
        player1Sets,
        player2Sets,
        player1Forfeit: finalPlayer1Forfeit,
        player2Forfeit: finalPlayer2Forfeit,
      },
    });

    // Process ratings if not forfeited
    if (!finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      const player1Won = player1Sets > player2Sets;
      await processMatchRating(member1Id, member2Id, player1Won, null, match.id, false, true);
    }

    // Fetch the created match with member details
    const createdMatch = await prisma.match.findUnique({
      where: { id: match.id },
    });

    const [member1WithDetails, member2WithDetails] = await Promise.all([
      prisma.member.findUnique({
        where: { id: member1Id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rating: true,
        },
      }),
      prisma.member.findUnique({
        where: { id: member2Id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rating: true,
        },
      }),
    ]);

    // Get rating history for this match
    const ratingHistory = await prisma.ratingHistory.findMany({
      where: {
        matchId: match.id,
      },
    });

    const player1RatingHistory = ratingHistory.find(rh => rh.memberId === member1Id);
    const player2RatingHistory = ratingHistory.find(rh => rh.memberId === member2Id);

    const matchWithDetails = {
      ...createdMatch,
      member1: member1WithDetails,
      member2: member2WithDetails,
      player1RatingBefore: player1RatingHistory ? (player1RatingHistory.rating ?? 0) - (player1RatingHistory.ratingChange ?? 0) : null,
      player1RatingChange: player1RatingHistory?.ratingChange ?? null,
      player2RatingBefore: player2RatingHistory ? (player2RatingHistory.rating ?? 0) - (player2RatingHistory.ratingChange ?? 0) : null,
      player2RatingChange: player2RatingHistory?.ratingChange ?? null,
    };

    logger.info('Standalone match created', { matchId: match.id, member1Id, member2Id });
    res.status(201).json(matchWithDetails);
  } catch (error) {
    logger.error('Error creating standalone match', { error });
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// Delete a standalone match
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const matchId = parseInt(req.params.id);

    if (isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }

    const userIsOrganizer = await isOrganizer(req);
    if (!userIsOrganizer) {
      return res.status(403).json({ error: 'Only organizers can delete matches' });
    }

    // Verify it's a standalone match
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.tournamentId !== null) {
      return res.status(400).json({ error: 'Cannot delete tournament matches through this endpoint' });
    }

    // Delete rating history and match
    await prisma.$transaction([
      prisma.ratingHistory.deleteMany({
        where: { matchId },
      }),
      prisma.match.delete({
        where: { id: matchId },
      }),
    ]);

    logger.info('Standalone match deleted', { matchId });
    res.json({ message: 'Match deleted successfully' });
  } catch (error) {
    logger.error('Error deleting standalone match', { error });
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

export default router;
