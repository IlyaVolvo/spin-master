import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';

const router = Router();
const prisma = new PrismaClient();

// Helper function to check if user has ORGANIZER role
async function isOrganizer(req: AuthRequest): Promise<boolean> {
  // Check if session has member with ORGANIZER role
  if (req.member && req.member.roles.includes('ORGANIZER')) {
    return true;
  }
  return false;
}

// Create or update a round robin match
// This is a round robin-specific endpoint that handles matrix-specific logic
router.patch('/tournaments/:tournamentId/round-robin-matches/:matchId', [
  body('member1Id').isInt({ min: 1 }),
  body('member2Id').isInt({ min: 1 }),
  body('player1Sets').optional().isInt({ min: 0 }),
  body('player2Sets').optional().isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can update round robin matches' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
    const tournamentId = parseInt(req.params.tournamentId);
    const matchId = parseInt(req.params.matchId);

    if (isNaN(tournamentId) || isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid tournament ID or match ID' });
    }

    // Verify tournament is round robin and active
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'ROUND_ROBIN') {
      return res.status(400).json({ error: 'This endpoint is only for round robin tournaments' });
    }

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tournament is not active' });
    }

    // Verify both players are participants
    const participantIds = tournament.participants.map((p: any) => p.memberId);
    if (!participantIds.includes(member1Id) || !participantIds.includes(member2Id)) {
      return res.status(400).json({ error: 'Both players must be tournament participants' });
    }

    if (member1Id === member2Id) {
      return res.status(400).json({ error: 'Players must be different' });
    }

    // Validate forfeit logic: exactly one player can forfeit
    const forfeit1 = player1Forfeit === true;
    const forfeit2 = player2Forfeit === true;
    if (forfeit1 && forfeit2) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
    }

    // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
    if (!forfeit1 && !forfeit2) {
      const player1SetsValue = player1Sets ?? 0;
      const player2SetsValue = player2Sets ?? 0;
      // Disallow equal scores including 0:0
      if (player1SetsValue === player2SetsValue) {
        return res.status(400).json({ error: 'Scores cannot be equal. One player must win.' });
      }
    }

    // Process scores and forfeits
    let finalPlayer1Sets = player1Sets ?? 0;
    let finalPlayer2Sets = player2Sets ?? 0;
    let finalPlayer1Forfeit = forfeit1;
    let finalPlayer2Forfeit = forfeit2;

    if (forfeit1) {
      finalPlayer1Sets = 0;
      finalPlayer2Sets = 1;
      finalPlayer1Forfeit = true;
      finalPlayer2Forfeit = false;
    } else if (forfeit2) {
      finalPlayer1Sets = 1;
      finalPlayer2Sets = 0;
      finalPlayer1Forfeit = false;
      finalPlayer2Forfeit = true;
    }

    // Check if match exists
    const existingMatch = await prisma.match.findUnique({
      where: { id: matchId },
    });

    let updatedMatch;

    if (existingMatch) {
      // Update existing match
      updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          member1Id,
          member2Id,
          player1Sets: finalPlayer1Sets,
          player2Sets: finalPlayer2Sets,
          player1Forfeit: finalPlayer1Forfeit,
          player2Forfeit: finalPlayer2Forfeit,
        },
      });
    } else {
      // Create new match
      updatedMatch = await prisma.match.create({
        data: {
          tournamentId,
          member1Id,
          member2Id,
          player1Sets: finalPlayer1Sets,
          player2Sets: finalPlayer2Sets,
          player1Forfeit: finalPlayer1Forfeit,
          player2Forfeit: finalPlayer2Forfeit,
        },
      });
    }

    // For Round Robin tournaments, we DON'T calculate ratings per match
    // Ratings are calculated only when the tournament is completed
    // This ensures all matches are considered together for fair rating adjustments

    // Check if tournament should be completed (all matches played)
    // Get total number of participants and calculate expected matches
    const participantCount = tournament.participants.length;
    const expectedMatches = (participantCount * (participantCount - 1)) / 2;

    // Count actual matches played
    const playedMatchesCount = await prisma.match.count({
      where: {
        tournamentId,
        OR: [
          { player1Sets: { gt: 0 } },
          { player2Sets: { gt: 0 } },
          { player1Forfeit: true },
          { player2Forfeit: true },
        ],
      },
    });

    // If all matches are played, complete the tournament and calculate ratings
    if (playedMatchesCount >= expectedMatches) {
      // Mark tournament as completed
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED' },
      });

      // Calculate ratings for all matches in the tournament
      if (!finalPlayer1Forfeit && !finalPlayer2Forfeit) {
        const { createRatingHistoryForRoundRobinTournament } = await import('../services/usattRatingService');
        await createRatingHistoryForRoundRobinTournament(tournamentId);
      }
    }

    res.json(updatedMatch);
  } catch (error) {
    console.error('Error updating round robin match:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
