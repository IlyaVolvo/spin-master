import { TournamentPlugin, TournamentCreationContext, TournamentEnrichmentContext, EnrichedTournament, TournamentCompletionContext, TournamentCancellationContext, TournamentDeletionContext, MatchCompletedEvent, ChildTournamentCompletedEvent, TournamentStateChangeResult } from './TournamentPlugin';
import { Tournament, TournamentParticipant, Match } from '@prisma/client';
import { logger } from '../utils/logger';

export abstract class BaseTournamentPlugin implements TournamentPlugin {
  abstract type: string;
  abstract isBasic: boolean;

  // Abstract methods that must be implemented by subclasses
  abstract enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament>;
  abstract createTournament(context: TournamentCreationContext): Promise<Tournament>;
  abstract isComplete(tournament: any): boolean;
  abstract canCancel(tournament: any): boolean;
  abstract matchesRemaining(tournament: any): number;
  abstract getSchedule(context: { tournament: any; prisma: any }): Promise<any>;
  abstract getPrintableView(context: { tournament: any; prisma: any }): Promise<any>;
  abstract updateMatch(context: {
    matchId: number;
    tournamentId: number;
    member1Id?: number;
    member2Id?: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
    userId?: number;
  }): Promise<{
    match: any;
    tournamentStateChange?: {
      shouldMarkComplete?: boolean;
      message?: string;
    };
  }>;

  // Default implementation for canModify - tournament can be modified if no matches have been played
  canModify(tournament: any): boolean {
    if (!tournament.matches || tournament.matches.length === 0) {
      return true;
    }
    
    // Check if any matches have been played
    const hasPlayedMatches = tournament.matches.some((match: any) => {
      const hasScore = (match.player1Sets || 0) > 0 || (match.player2Sets || 0) > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasScore || hasForfeit;
    });
    
    return !hasPlayedMatches;
  }

  // Default implementation for modifyTournament - can be overridden by subclasses
  async modifyTournament(context: {
    tournamentId: number;
    name: string;
    participantIds: number[];
    players: any[];
    prisma: any;
    additionalData?: Record<string, any>;
  }): Promise<Tournament> {
    const { tournamentId, name, participantIds, players, prisma, additionalData } = context;
    
    logger.info('Modifying tournament', { tournamentId, name, participantCount: participantIds.length });
    
    // Get existing tournament to verify it can be modified
    const existingTournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: true,
        matches: true,
      },
    });
    
    if (!existingTournament) {
      throw new Error('Tournament not found');
    }
    
    if (!this.canModify(existingTournament)) {
      throw new Error('Tournament cannot be modified - matches have already been played');
    }
    
    // Delete existing participants (they'll be recreated)
    await prisma.tournamentParticipant.deleteMany({
      where: { tournamentId },
    });
    
    // Update tournament with new data
    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        name,
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find((p: any) => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null,
            };
          }),
        },
        // Let subclasses handle their specific data updates
        ...(await this.getTournamentSpecificUpdateData(existingTournament, additionalData, prisma)),
      },
      include: {
        participants: { include: { member: true } },
        matches: true,
      },
    });
    
    logger.info('Tournament modified successfully', { tournamentId, newParticipantCount: participantIds.length });
    
    return updatedTournament;
  }

  // Abstract method for subclasses to provide their specific update data
  protected abstract getTournamentSpecificUpdateData(
    existingTournament: any,
    additionalData: Record<string, any> | undefined,
    prisma: any
  ): Promise<Record<string, any>>;

  // Default implementations for optional methods
  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    // Default implementation - just return the tournament as-is
    return context.tournament as EnrichedTournament;
  }

  async onMatchCompleted?(event: MatchCompletedEvent): Promise<TournamentStateChangeResult> {
    // Default implementation - do nothing
    return {};
  }

  async onChildTournamentCompleted?(event: ChildTournamentCompletedEvent): Promise<TournamentStateChangeResult> {
    // Default implementation - do nothing
    return {};
  }

  async onMatchRatingCalculation?(context: { tournament: any; match: any; winnerId: number; prisma: any }): Promise<void> {
    // Default implementation - do nothing
  }

  async onTournamentCompletionRatingCalculation?(context: { tournament: any; prisma: any }): Promise<void> {
    // Default implementation - do nothing
  }

  async resolveMatchId?(context: {
    matchId: number;
    tournamentId: number;
    prisma: any;
  }): Promise<{
    match: any;
    bracketMatchId?: number;
    isBracketMatchId?: boolean;
  } | null> {
    // Default implementation - return null
    return null;
  }

  async handlePluginRequest?(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any> {
    // Default implementation - throw error for unsupported requests
    throw new Error(`Plugin request not supported: ${context.method} ${context.resource}`);
  }

  async onCancel?(context: TournamentCancellationContext): Promise<{ shouldKeepMatches: boolean; message?: string }> {
    // Default implementation - keep matches
    return { shouldKeepMatches: true };
  }

  async onDelete?(context: TournamentDeletionContext): Promise<void> {
    // Default implementation - do nothing
  }
}
