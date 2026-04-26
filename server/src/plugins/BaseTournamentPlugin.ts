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
    skipRatingCalculation?: boolean;
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

  protected getMatchWinnerId(match: any): number | null {
    if (!match) return null;
    if (match.player1Forfeit) return match.member2Id ?? null;
    if (match.player2Forfeit) return match.member1Id ?? null;
    if ((match.player1Sets ?? 0) > (match.player2Sets ?? 0)) return match.member1Id ?? null;
    if ((match.player2Sets ?? 0) > (match.player1Sets ?? 0)) return match.member2Id ?? null;
    return null;
  }

  protected async rollbackMatchRatings(prisma: any, matchId: number): Promise<void> {
    if (typeof prisma.ratingHistory?.findMany !== 'function') return;
    const histories = await prisma.ratingHistory.findMany({
      where: { matchId },
      orderBy: { timestamp: 'desc' },
    });
    if (histories.length === 0) return;

    for (const h of histories) {
      if (h.ratingChange == null) continue;
      const member = await prisma.member.findUnique({ where: { id: h.memberId } });
      if (!member || member.rating == null) continue;
      await prisma.member.update({
        where: { id: h.memberId },
        data: { rating: member.rating - h.ratingChange },
      });
    }

    await prisma.ratingHistory.deleteMany({ where: { matchId } });
  }

  protected async replaceMatchRatingsAndReplay(prisma: any, match: any, winnerId: number): Promise<void> {
    const plan = await this.buildRatingReplayPlan(prisma, match.id);
    const rating1Before = plan.beforeRatings.get(match.member1Id);
    const rating2Before = plan.beforeRatings.get(match.member2Id);

    if (rating1Before === undefined || rating2Before === undefined) {
      await this.rollbackMatchRatings(prisma, match.id);
      return;
    }

    await prisma.ratingHistory.deleteMany({ where: { matchId: match.id } });

    const { adjustRatingsForSingleMatch } = await import('../services/usattRatingService');
    await adjustRatingsForSingleMatch(
      match.member1Id,
      match.member2Id,
      winnerId === match.member1Id,
      match.tournamentId,
      match.id,
      {
        rating1BeforeOverride: rating1Before,
        rating2BeforeOverride: rating2Before,
        timestamp: plan.replacementTimestamp,
      },
    );

    const replacementRows = await prisma.ratingHistory.findMany({
      where: { matchId: match.id },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    });

    await this.replayLaterRatingRows(prisma, plan, replacementRows);
  }

  protected async removeMatchRatingsAndReplay(prisma: any, matchId: number): Promise<void> {
    const plan = await this.buildRatingReplayPlan(prisma, matchId);
    if (plan.affectedMemberIds.length === 0) return;

    await prisma.ratingHistory.deleteMany({ where: { matchId } });
    await this.replayLaterRatingRows(prisma, plan, []);
  }

  private async buildRatingReplayPlan(prisma: any, matchId: number): Promise<{
    affectedMemberIds: number[];
    beforeRatings: Map<number, number>;
    laterRows: any[];
    replacementTimestamp: Date;
  }> {
    if (typeof prisma.ratingHistory?.findMany !== 'function') {
      return {
        affectedMemberIds: [],
        beforeRatings: new Map(),
        laterRows: [],
        replacementTimestamp: new Date(),
      };
    }

    const histories = await prisma.ratingHistory.findMany({
      where: { matchId },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    });

    if (histories.length === 0) {
      return {
        affectedMemberIds: [],
        beforeRatings: new Map(),
        laterRows: [],
        replacementTimestamp: new Date(),
      };
    }

    const beforeRatings = new Map<number, number>();
    for (const history of histories) {
      const ratingBefore = await this.resolveRatingBeforeHistoryRow(prisma, history);
      if (ratingBefore !== undefined) {
        beforeRatings.set(history.memberId, ratingBefore);
      }
    }

    const affectedMemberIds = Array.from(beforeRatings.keys());
    const replacementTimestamp = histories.reduce((min: Date, history: any) =>
      history.timestamp < min ? history.timestamp : min,
    histories[0].timestamp);
    const laterThresholdTimestamp = histories.reduce((max: Date, history: any) =>
      history.timestamp > max ? history.timestamp : max,
    histories[0].timestamp);
    const laterThresholdId = histories
      .filter((history: any) => history.timestamp.getTime() === laterThresholdTimestamp.getTime())
      .reduce((max: number, history: any) => Math.max(max, history.id), 0);

    const laterRows = affectedMemberIds.length > 0
      ? await prisma.ratingHistory.findMany({
          where: {
            memberId: { in: affectedMemberIds },
            matchId: { not: matchId },
            OR: [
              { timestamp: { gt: laterThresholdTimestamp } },
              { timestamp: laterThresholdTimestamp, id: { gt: laterThresholdId } },
            ],
          },
          orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
        })
      : [];

    return { affectedMemberIds, beforeRatings, laterRows, replacementTimestamp };
  }

  private async resolveRatingBeforeHistoryRow(prisma: any, targetRow: any): Promise<number | undefined> {
    const priorRows = await prisma.ratingHistory.findMany({
      where: {
        memberId: targetRow.memberId,
        OR: [
          { timestamp: { lt: targetRow.timestamp } },
          { timestamp: targetRow.timestamp, id: { lt: targetRow.id } },
        ],
      },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    });

    let rating: number | undefined;

    for (const row of priorRows) {
      if (row.matchId === targetRow.matchId) continue;
      if (row.ratingChange != null && rating !== undefined) {
        rating = Math.max(0, Math.round(rating + row.ratingChange));
      } else if (row.ratingChange != null && row.rating != null) {
        rating = row.rating - row.ratingChange;
        rating = Math.max(0, Math.round(rating + row.ratingChange));
      } else if (row.rating != null) {
        rating = row.rating;
      }
    }

    if (rating !== undefined) {
      return rating;
    }

    if (targetRow.rating != null && targetRow.ratingChange != null) {
      return targetRow.rating - targetRow.ratingChange;
    }

    const member = await prisma.member.findUnique({
      where: { id: targetRow.memberId },
      select: { rating: true },
    });
    return member?.rating ?? undefined;
  }

  private async replayLaterRatingRows(
    prisma: any,
    plan: {
      affectedMemberIds: number[];
      beforeRatings: Map<number, number>;
      laterRows: any[];
    },
    replacementRows: any[],
  ): Promise<void> {
    const runningRatings = new Map<number, number>();

    for (const memberId of plan.affectedMemberIds) {
      const before = plan.beforeRatings.get(memberId);
      if (before !== undefined) {
        runningRatings.set(memberId, before);
      }
    }

    for (const row of replacementRows) {
      if (row.rating != null) {
        runningRatings.set(row.memberId, row.rating);
      }
    }

    for (const row of plan.laterRows) {
      const current = runningRatings.get(row.memberId);
      if (current === undefined) continue;

      if (row.ratingChange == null) {
        if (row.rating != null) {
          runningRatings.set(row.memberId, row.rating);
        }
        continue;
      }

      const nextRating = Math.max(0, Math.round(current + row.ratingChange));
      await prisma.ratingHistory.update({
        where: { id: row.id },
        data: { rating: nextRating },
      });
      runningRatings.set(row.memberId, nextRating);
    }

    for (const [memberId, rating] of runningRatings.entries()) {
      await prisma.member.update({
        where: { id: memberId },
        data: { rating },
      });
    }
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
