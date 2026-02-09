import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { processMatchRating } from '../services/matchRatingService';
import bcrypt from 'bcryptjs';

const router = express.Router();

router.use(authenticate);

// Helper function to check if user has ORGANIZER role
async function isOrganizer(req: AuthRequest): Promise<boolean> {
  if (req.member && Array.isArray(req.member.roles)) {
    const hasOrganizerRole = req.member.roles.some(role => 
      String(role).toUpperCase() === 'ORGANIZER'
    );
    if (hasOrganizerRole) return true;
  }
  
  if (req.memberId) {
    try {
      const member = await prisma.member.findUnique({
        where: { id: req.memberId },
        select: { roles: true },
      });
      
      if (member && Array.isArray(member.roles)) {
        const hasOrganizerRole = member.roles.some(role => 
          String(role).toUpperCase() === 'ORGANIZER'
        );
        if (hasOrganizerRole) return true;
      }
    } catch (error) {
      logger.error('Error checking organizer status', { error });
    }
  }
  
  return false;
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
          player1RatingBefore: player1RatingHistory ? (player1RatingHistory.rating || 0) - (player1RatingHistory.ratingChange || 0) : null,
          player1RatingChange: player1RatingHistory?.ratingChange || null,
          player2RatingBefore: player2RatingHistory ? (player2RatingHistory.rating || 0) - (player2RatingHistory.ratingChange || 0) : null,
          player2RatingChange: player2RatingHistory?.ratingChange || null,
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
  body('opponentPassword').optional().isString(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit, opponentPassword } = req.body;

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

    const userIsOrganizer = await isOrganizer(req);

    // Authorization check
    if (!userIsOrganizer) {
      // Non-organizers can only create matches involving themselves
      if (req.memberId !== member1Id && req.memberId !== member2Id) {
        return res.status(403).json({ error: 'You can only create matches for yourself' });
      }

      // Require opponent's password confirmation
      if (!opponentPassword) {
        return res.status(400).json({ error: 'Opponent password confirmation required' });
      }

      const opponentId = req.memberId === member1Id ? member2Id : member1Id;
      const opponent = opponentId === member1Id ? member1 : member2;

      const passwordValid = await bcrypt.compare(opponentPassword, opponent.password);
      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid opponent password' });
      }
    }

    // Validate score
    if (player1Sets === 0 && player2Sets === 0) {
      return res.status(400).json({ error: 'At least one player must have scored' });
    }

    const finalPlayer1Forfeit = player1Forfeit || false;
    const finalPlayer2Forfeit = player2Forfeit || false;

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
      player1RatingBefore: player1RatingHistory ? (player1RatingHistory.rating || 0) - (player1RatingHistory.ratingChange || 0) : null,
      player1RatingChange: player1RatingHistory?.ratingChange || null,
      player2RatingBefore: player2RatingHistory ? (player2RatingHistory.rating || 0) - (player2RatingHistory.ratingChange || 0) : null,
      player2RatingChange: player2RatingHistory?.ratingChange || null,
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
