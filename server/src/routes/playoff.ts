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

// Create or update a playoff match with bracket linking
// This is a playoff-specific endpoint that handles the transaction properly
router.patch('/tournaments/:tournamentId/playoff-matches/:bracketMatchId', [
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
      return res.status(403).json({ error: 'Only Organizers can update playoff matches' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
    const tournamentId = parseInt(req.params.tournamentId);
    const bracketMatchId = parseInt(req.params.bracketMatchId);

    if (isNaN(tournamentId) || isNaN(bracketMatchId)) {
      return res.status(400).json({ error: 'Invalid tournament ID or bracket match ID' });
    }

    // Verify tournament is playoff and active
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'PLAYOFF') {
      return res.status(400).json({ error: 'This endpoint is only for playoff tournaments' });
    }

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tournament is not active' });
    }

    // Get the bracket match
    const bracketMatch = await prisma.bracketMatch.findUnique({
      where: { id: bracketMatchId },
      include: { match: true },
    });

    if (!bracketMatch) {
      return res.status(404).json({ error: 'Bracket match not found' });
    }

    if (bracketMatch.tournamentId !== tournamentId) {
      return res.status(400).json({ error: 'Bracket match does not belong to this tournament' });
    }

    // Check if this is a BYE match
    const isByeMatch = bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0 || bracketMatch.member2Id === null;
    if (isByeMatch) {
      return res.status(400).json({ error: 'Cannot create or update match for BYE - BYE players are automatically promoted' });
    }

    // Validate forfeit logic
    const forfeit1 = player1Forfeit === true;
    const forfeit2 = player2Forfeit === true;
    if (forfeit1 && forfeit2) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
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

    // Transactional match creation/update
    const result = await prisma.$transaction(async (tx) => {
      let updatedMatch;

      if (bracketMatch.match) {
        // Update existing match
        updatedMatch = await tx.match.update({
          where: { id: bracketMatch.match.id },
          data: {
            player1Sets: finalPlayer1Sets,
            player2Sets: finalPlayer2Sets,
            player1Forfeit: finalPlayer1Forfeit,
            player2Forfeit: finalPlayer2Forfeit,
          },
        });
      } else {
        // Create new match
        updatedMatch = await tx.match.create({
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

        // Link bracket match to new match
        await tx.bracketMatch.update({
          where: { id: bracketMatchId },
          data: { matchId: updatedMatch.id },
        });
      }

      return updatedMatch;
    });

    // Process ratings and winner advancement
    if (!finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      const winnerId = finalPlayer1Sets > finalPlayer2Sets ? member1Id :
                       finalPlayer2Sets > finalPlayer1Sets ? member2Id : null;
      
      if (winnerId) {
        // Process ratings for playoff
        const { processMatchRating } = await import('../services/matchRatingService');
        const player1Won = winnerId === member1Id;
        await processMatchRating(member1Id, member2Id, player1Won, tournamentId, result.id, false, true);

        // Advance winner to next round
        const { advanceWinner } = await import('../services/playoffBracketService');
        const { tournamentCompleted } = await advanceWinner(tournamentId, bracketMatchId, winnerId);

        if (tournamentCompleted) {
          // Mark tournament as completed
          await prisma.tournament.update({
            where: { id: tournamentId },
            data: { status: 'COMPLETED' },
          });
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error updating playoff match:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
