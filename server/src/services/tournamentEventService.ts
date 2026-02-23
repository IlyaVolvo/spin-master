import { PrismaClient } from '@prisma/client';
import { tournamentPluginRegistry } from '../plugins/TournamentPluginRegistry';
import { MatchCompletedEvent, TournamentStateChangeResult } from '../plugins/TournamentPlugin';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Tournament Event Service
 * Handles event propagation through the tournament hierarchy and executes state changes
 */
export class TournamentEventService {
  /**
   * Handle match completion event
   * - Notifies the tournament plugin
   * - Calculates ratings if needed
   * - Propagates event to parent tournament if applicable
   * - Executes state changes (marking complete, creating finals, etc.)
   */
  async handleMatchCompleted(matchId: number, tournamentId: number): Promise<void> {
    try {
      // Fetch the tournament with all necessary data
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          participants: {
            include: {
              member: true,
            },
          },
          matches: true,
          childTournaments: true,
          bracketMatches: true,
        },
      });

      if (!tournament) {
        throw new Error(`Tournament ${tournamentId} not found`);
      }

      const match = await prisma.match.findUnique({
        where: { id: matchId },
      });

      if (!match) {
        throw new Error(`Match ${matchId} not found`);
      }

      const plugin = tournamentPluginRegistry.get(tournament.type);
      const winnerId = match.player1Sets > match.player2Sets
        ? match.member1Id
        : match.player2Sets > match.player1Sets
          ? match.member2Id
          : match.player1Forfeit
            ? match.member2Id
            : match.player2Forfeit
              ? match.member1Id
              : null;

      // Calculate ratings if plugin requires it
      if (
        plugin.onMatchRatingCalculation &&
        winnerId !== null &&
        match.member1Id !== 0 &&
        match.member2Id !== 0
      ) {
        await plugin.onMatchRatingCalculation({ tournament, match, winnerId, prisma });
        logger.info(`Ratings calculated for match ${matchId} in tournament ${tournamentId}`);
      }

      // Notify plugin of match completion
      const event: MatchCompletedEvent = { tournament, match, winnerId, prisma };
      const result = await plugin.onMatchCompleted?.(event);

      // Execute state changes
      if (result) {
        await this.executeStateChanges(tournament, result);
      }

      // If tournament is now complete, propagate to parent
      if (result?.shouldMarkComplete && tournament.parentTournamentId) {
        await this.handleChildTournamentCompleted(tournament.id, tournament.parentTournamentId);
      }

      logger.info(`Match completion handled for match ${matchId} in tournament ${tournamentId}`);
    } catch (error) {
      logger.error('Error handling match completion', { 
        matchId, 
        tournamentId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Handle child tournament completion event
   * - Notifies the parent tournament plugin
   * - Executes state changes (creating finals, marking parent complete, etc.)
   * - Propagates further up the hierarchy if needed
   */
  async handleChildTournamentCompleted(childTournamentId: number, parentTournamentId: number): Promise<void> {
    try {
      const parentTournament = await prisma.tournament.findUnique({
        where: { id: parentTournamentId },
        include: {
          participants: {
            include: {
              member: true,
            },
          },
          matches: true,
          childTournaments: {
            include: {
              participants: {
                include: {
                  member: true,
                },
              },
              matches: true,
            },
          },
        },
      });

      if (!parentTournament) {
        throw new Error(`Parent tournament ${parentTournamentId} not found`);
      }

      const childTournament = await prisma.tournament.findUnique({
        where: { id: childTournamentId },
        include: {
          participants: {
            include: {
              member: true,
            },
          },
          matches: true,
        },
      });

      if (!childTournament) {
        throw new Error(`Child tournament ${childTournamentId} not found`);
      }

      const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);

      // Notify parent plugin of child completion
      const result = await parentPlugin.onChildTournamentCompleted?.({
        parentTournament,
        childTournament,
        prisma,
      });

      // Execute state changes
      if (result) {
        await this.executeStateChanges(parentTournament, result);
      }

      // If parent is now complete and has its own parent, propagate further
      if (result?.shouldMarkComplete && parentTournament.parentTournamentId) {
        await this.handleChildTournamentCompleted(parentTournament.id, parentTournament.parentTournamentId);
      }

      logger.info(`Child tournament completion handled for ${childTournamentId} -> parent ${parentTournamentId}`);
    } catch (error) {
      logger.error('Error handling child tournament completion', { 
        childTournamentId, 
        parentTournamentId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Execute state changes based on plugin result
   */
  private async executeStateChanges(tournament: any, result: TournamentStateChangeResult): Promise<void> {
    // Mark tournament as complete
    if (result.shouldMarkComplete) {
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'COMPLETED' },
      });
      logger.info(`Tournament ${tournament.id} marked as COMPLETED`);
    }

    // Create final tournament (for compound tournaments)
    if (result.shouldCreateFinalTournament && result.finalTournamentConfig) {
      logger.info(`Final tournament creation requested for parent ${tournament.id}`, {
        config: result.finalTournamentConfig,
        message: result.message,
      });
      // TODO: Implement final tournament creation logic
      // This would involve:
      // 1. Determining top N players from each group
      // 2. Creating the final tournament using the appropriate plugin
      // 3. Linking it to the parent tournament
    }

    // Log any messages
    if (result.message) {
      logger.info(`Tournament ${tournament.id}: ${result.message}`);
    }
  }

  /**
   * Check if a tournament is complete by querying its plugin
   */
  async checkTournamentCompletion(tournamentId: number): Promise<boolean> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: true,
        matches: true,
        childTournaments: true,
        bracketMatches: true,
      },
    });

    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const plugin = tournamentPluginRegistry.get(tournament.type);
    return plugin.isComplete(tournament);
  }

  /**
   * Manually trigger completion check for a tournament
   * Useful for admin actions or scheduled jobs
   */
  async triggerCompletionCheck(tournamentId: number): Promise<void> {
    const isComplete = await this.checkTournamentCompletion(tournamentId);
    
    if (isComplete) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (tournament && tournament.status !== 'COMPLETED') {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'COMPLETED' },
        });
        logger.info(`Tournament ${tournamentId} marked as COMPLETED via manual check`);

        // Propagate to parent if exists
        if (tournament.parentTournamentId) {
          await this.handleChildTournamentCompleted(tournamentId, tournament.parentTournamentId);
        }
      }
    }
  }
}

export const tournamentEventService = new TournamentEventService();
