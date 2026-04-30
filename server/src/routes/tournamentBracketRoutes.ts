/**
 * Playoff bracket HTTP surface: first-result recording and clearing by BracketMatch id.
 * Generic tournament routes stay in tournaments.ts (registry + plugins only).
 */
import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { invalidateCacheAfterTournament } from '../services/cacheService';
import { emitCacheInvalidation, emitMatchUpdate } from '../services/socketService';
import { tournamentPluginRegistry } from '../plugins/TournamentPluginRegistry';
import { recalculateRankings } from '../services/rankingService';
import { isClientHttpError } from '../http/clientHttpError';
import {
  recordPlayoffBracketMatchResult,
  PlayoffBracketResultError,
} from '../services/playoffBracketService';
import { isOrganizer } from '../utils/organizerAccess';
import { authorizeTournamentScoreEntryRequest } from '../utils/matchScoreAuthorization';

const router = express.Router();
router.use(authenticate);

router.patch('/:tournamentId/bracket-matches/:bracketMatchId', [
  body('player1Sets').optional().isInt({ min: 0 }),
  body('player2Sets').optional().isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
  body('opponentPassword').optional().trim(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tournamentId = parseInt(req.params.tournamentId);
    const bracketMatchId = parseInt(req.params.bracketMatchId);

    if (isNaN(tournamentId) || isNaN(bracketMatchId)) {
      return res.status(400).json({ error: 'Invalid tournament or bracket match ID' });
    }

    const { player1Forfeit, player2Forfeit } = req.body;

    if (player1Forfeit === true && player2Forfeit === true) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
    }

    let finalPlayer1Sets = req.body.player1Sets ?? 0;
    let finalPlayer2Sets = req.body.player2Sets ?? 0;
    let finalPlayer1Forfeit = player1Forfeit || false;
    let finalPlayer2Forfeit = player2Forfeit || false;

    if (finalPlayer1Forfeit) {
      finalPlayer1Sets = 0;
      finalPlayer2Sets = 1;
      finalPlayer2Forfeit = false;
    } else if (finalPlayer2Forfeit) {
      finalPlayer1Sets = 1;
      finalPlayer2Sets = 0;
      finalPlayer1Forfeit = false;
    }

    if (!finalPlayer1Forfeit && !finalPlayer2Forfeit && finalPlayer1Sets === finalPlayer2Sets) {
      return res.status(400).json({ error: 'Scores cannot be equal. One player must win.' });
    }

    const scoreAuth = await authorizeTournamentScoreEntryRequest(prisma, req, {
      tournamentId,
      matchId: bracketMatchId,
      opponentPassword: req.body?.opponentPassword,
    });
    if (!scoreAuth.ok) {
      return res.status(scoreAuth.status).json({ error: scoreAuth.error });
    }

    let newMatch: { id: number; member1Id: number; member2Id: number | null; tournament?: { type: string } };
    let tournamentCompleted: boolean;
    try {
      const recorded = await recordPlayoffBracketMatchResult(prisma, {
        tournamentId,
        bracketMatchId,
        player1Sets: finalPlayer1Sets,
        player2Sets: finalPlayer2Sets,
        player1Forfeit: finalPlayer1Forfeit,
        player2Forfeit: finalPlayer2Forfeit,
      });
      newMatch = recorded.match;
      tournamentCompleted = recorded.tournamentCompleted;
    } catch (err) {
      if (err instanceof PlayoffBracketResultError || isClientHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      throw err;
    }

    const winnerId = finalPlayer1Forfeit
      ? newMatch.member2Id!
      : finalPlayer2Forfeit
        ? newMatch.member1Id
        : finalPlayer1Sets > finalPlayer2Sets
          ? newMatch.member1Id
          : newMatch.member2Id!;

    const tournamentForRating = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });

    if (!tournamentForRating) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const plugin = tournamentPluginRegistry.get(tournamentForRating.type);
    if (plugin.onMatchRatingCalculation && !finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      await plugin.onMatchRatingCalculation({
        tournament: tournamentForRating,
        match: newMatch,
        winnerId,
        prisma,
      });
    }

    if (tournamentCompleted) {
      const completedTournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          participants: { include: { member: true } },
          matches: true,
        },
      });

      if (completedTournament) {
        if (plugin.onTournamentCompletionRatingCalculation) {
          await plugin.onTournamentCompletionRatingCalculation({ tournament: completedTournament, prisma });
        }

        const { recalculateRankings: recalc } = await import('../services/rankingService');
        await recalc(tournamentId);

        if (completedTournament.parentTournamentId) {
          const parentTournament = await prisma.tournament.findUnique({
            where: { id: completedTournament.parentTournamentId },
            include: {
              childTournaments: {
                include: { participants: { include: { member: true } }, matches: true },
              },
              participants: { include: { member: true } },
            },
          });

          if (parentTournament) {
            const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);
            if (parentPlugin.onChildTournamentCompleted) {
              const parentResult = await parentPlugin.onChildTournamentCompleted({
                parentTournament,
                childTournament: completedTournament,
                prisma,
              });

              if (parentResult.shouldMarkComplete) {
                await prisma.tournament.update({
                  where: { id: parentTournament.id },
                  data: { status: 'COMPLETED', recordedAt: new Date() },
                });
              }
            }
          }
        }
      }
    }

    await invalidateCacheAfterTournament(tournamentId);
    emitMatchUpdate(newMatch, tournamentId);
    emitCacheInvalidation(tournamentId);

    res.status(201).json(newMatch);
  } catch (error) {
    logger.error('Error recording bracket match result', {
      error: error instanceof Error ? error.message : String(error),
      tournamentId: req.params.tournamentId,
      bracketMatchId: req.params.bracketMatchId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:tournamentId/bracket-matches/:bracketMatchId', async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can delete matches' });
    }

    const tournamentId = parseInt(req.params.tournamentId);
    const bracketMatchId = parseInt(req.params.bracketMatchId);

    if (isNaN(tournamentId) || isNaN(bracketMatchId)) {
      return res.status(400).json({ error: 'Invalid tournament or bracket match ID' });
    }

    const bracketMatch = await prisma.bracketMatch.findUnique({
      where: { id: bracketMatchId },
      include: { tournament: { include: { participants: true } }, match: true, nextMatch: true },
    });

    if (!bracketMatch || bracketMatch.tournamentId !== tournamentId) {
      return res.status(404).json({ error: 'Bracket match not found' });
    }

    if (!bracketMatch.match) {
      return res.status(400).json({ error: 'No result to clear for this bracket match' });
    }

    const tournamentStatus = bracketMatch.tournament.status;

    if (bracketMatch.nextMatch) {
      const currentPosition = bracketMatch.position;
      const isPlayer1Slot = (currentPosition - 1) % 2 === 0;

      if (isPlayer1Slot) {
        await prisma.bracketMatch.update({
          where: { id: bracketMatch.nextMatch.id },
          data: { member1Id: null },
        });
      } else {
        await prisma.bracketMatch.update({
          where: { id: bracketMatch.nextMatch.id },
          data: { member2Id: null },
        });
      }
    }

    await prisma.bracketMatch.update({
      where: { id: bracketMatchId },
      data: { matchId: null },
    });

    await prisma.match.delete({
      where: { id: bracketMatch.match.id },
    });

    if (tournamentStatus === 'COMPLETED') {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'ACTIVE' },
      });
      await recalculateRankings(tournamentId);
    }

    await invalidateCacheAfterTournament(tournamentId);
    emitCacheInvalidation(tournamentId);

    res.status(204).send();
  } catch (error) {
    logger.error('Error clearing bracket match result', {
      error: error instanceof Error ? error.message : String(error),
      tournamentId: req.params.tournamentId,
      bracketMatchId: req.params.bracketMatchId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
