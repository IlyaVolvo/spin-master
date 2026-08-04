import { TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';
import { BaseTournamentPlugin } from './BaseTournamentPlugin';
import { createRatingHistoryForRoundRobinTournament } from '../services/usattRatingService';
import { CorrectionEligibility } from './TournamentPlugin';
import {
  blockedCorrectionEligibility,
  buildActiveModificationEligibility,
  getCompoundPreliminaryCorrectionBlockReason,
  getSiblingTournamentIds,
  scoredMatchIds,
  filterCorrectableMatchIdsByMemberDrift,
} from './scoreCorrectionHelpers';
import {
  findRatingDriftReason,
  matchHasCompetitiveResult,
  matchHasResult,
} from '../utils/scoreCorrectionMatchUtils';
import { duplicateTournamentMatchErrorWithRecordedResult, isDuplicateTournamentMatchError } from '../utils/matchConcurrency';
import { ClientHttpError } from '../http/clientHttpError';

export class RoundRobinPlugin extends BaseTournamentPlugin {
  type = 'ROUND_ROBIN';
  isBasic = true;
  scoreCorrectionUsesBatchTournamentRatings = true;
  preferCompletionRatingHistory = true;

  validateCreateRules(participantCount: number, _data: any): string | null {
    // Lazy require avoids circular import via systemConfigService → index → registry
    const { getTournamentRulesConfig } = require('../services/systemConfigService');
    const rules = getTournamentRulesConfig().roundRobin;
    if (participantCount < rules.minPlayers) {
      return `Round Robin requires at least ${rules.minPlayers} players`;
    }
    if (participantCount > rules.maxPlayers) {
      return `Round Robin allows at most ${rules.maxPlayers} players`;
    }
    return null;
  }

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma } = context;
    
    return await prisma.tournament.create({
      data: {
        name,
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find(p => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null,
            };
          }),
        },
      },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });
  }

  async enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, prisma } = context;

    // Attach rating history to matches (skipped if compound parent already batched)
    if (prisma) {
      const { attachMatchRatingHistory } = await import('../utils/matchRatingHistoryAttach');
      await attachMatchRatingHistory(tournament.matches, prisma);
    }

    return { ...tournament, bracketMatches: [] };
  }

  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, postRatingMap, prisma } = context;

    const memberIds = (tournament.participants || []).map((p: { memberId: number }) => p.memberId);
    const completionByMember = new Map<
      number,
      { rating: number; ratingChange: number | null }
    >();

    if (prisma && memberIds.length > 0) {
      const completionRows = await prisma.ratingHistory.findMany({
        where: {
          tournamentId: tournament.id,
          memberId: { in: memberIds },
          reason: 'TOURNAMENT_COMPLETED',
        },
        orderBy: { id: 'desc' },
        select: {
          memberId: true,
          rating: true,
          ratingChange: true,
        },
      });
      for (const row of completionRows) {
        if (!completionByMember.has(row.memberId)) {
          completionByMember.set(row.memberId, {
            rating: row.rating,
            ratingChange: row.ratingChange,
          });
        }
      }
    }

    const participantsWithPostRating = tournament.participants.map((participant: any) => {
      const key = `${tournament.id}-${participant.memberId}`;
      const postRatingFromMap = postRatingMap && postRatingMap.has(key)
        ? postRatingMap.get(key)
        : undefined;
      // Prefer cache map; else current member rating; else snapshot at signup (map miss should not mask updated rating).
      const postRating =
        postRatingFromMap ?? participant.member?.rating ?? participant.playerRatingAtTime ?? null;
      const tc = completionByMember.get(participant.memberId);
      return {
        ...participant,
        postRatingAtTime: postRating,
        rrCompletionRating: tc?.rating ?? null,
        rrCompletionRatingChange: tc?.ratingChange ?? null,
      };
    });

    // Attach rating history to matches (skipped if compound parent already batched)
    if (prisma) {
      const { attachMatchRatingHistory } = await import('../utils/matchRatingHistoryAttach');
      await attachMatchRatingHistory(tournament.matches, prisma);
    }

    return {
      ...tournament,
      participants: participantsWithPostRating,
      bracketMatches: [],
    };
  }

  isComplete(tournament: any): boolean {
    if (!tournament.participants || tournament.participants.length < 2) {
      return false;
    }

    const expectedMatches = (tournament.participants.length * (tournament.participants.length - 1)) / 2;
    const playedMatches = tournament.matches?.filter((m: any) => matchHasResult(m)).length || 0;

    return playedMatches >= expectedMatches;
  }

  shouldRecalculateRatings(tournament: any): boolean {
    // Round robin recalculates ratings only when tournament completes
    return this.isComplete(tournament) && tournament.status !== 'COMPLETED';
  }

  async onMatchRatingCalculation(_context: { tournament: any; match: any; winnerId: number; prisma: any }): Promise<void> {
    // Round robin: ratings are computed only at tournament completion (USATT 4-pass rules)
    // via createRatingHistoryForRoundRobinTournament → TOURNAMENT_COMPLETED, not per match.
  }

  canCancel(tournament: any): boolean {
    return true; // Can always cancel
  }

  matchesRemaining(tournament: any): number {
    if (!tournament.participants || tournament.participants.length < 2) {
      return 0;
    }
    const expectedMatches = (tournament.participants.length * (tournament.participants.length - 1)) / 2;
    const playedMatches = tournament.matches?.filter((m: any) => matchHasResult(m)).length || 0;
    return Math.max(0, expectedMatches - playedMatches);
  }

  async canEarlyComplete(context: {
    tournament: any;
    prisma: any;
    overrides?: { earlyCompleteMinPercent?: number };
  }): Promise<import('./TournamentPlugin').EarlyCompleteEligibility> {
    const { tournament, overrides } = context;
    if (tournament.status !== 'ACTIVE') {
      return {
        supported: true,
        allowed: false,
        reason: 'Tournament is not active',
      };
    }
    const n = tournament.participants?.length ?? 0;
    if (n < 2) {
      return { supported: true, allowed: false, reason: 'Not enough participants' };
    }
    const expectedMatches = (n * (n - 1)) / 2;
    if (expectedMatches <= 0) {
      return { supported: true, allowed: false, reason: 'No matches expected' };
    }
    const competitive = (tournament.matches || []).filter((m: any) => matchHasCompetitiveResult(m)).length;
    const playedPercent = (competitive / expectedMatches) * 100;
    const { getTournamentRulesConfig } = require('../services/systemConfigService');
    const systemMin = getTournamentRulesConfig().roundRobin.earlyCompleteMinPercent;
    const minPercent =
      typeof overrides?.earlyCompleteMinPercent === 'number'
        ? overrides.earlyCompleteMinPercent
        : systemMin;

    if (competitive >= expectedMatches) {
      return {
        supported: true,
        allowed: false,
        reason: 'All matches are already played',
        playedPercent: Math.floor(playedPercent),
        earlyCompleteMinPercent: minPercent,
      };
    }
    if (playedPercent < minPercent) {
      return {
        supported: true,
        allowed: false,
        reason: `Need at least ${minPercent}% of matches played (${Math.floor(playedPercent)}% so far)`,
        playedPercent: Math.floor(playedPercent),
        earlyCompleteMinPercent: minPercent,
      };
    }
    return {
      supported: true,
      allowed: true,
      playedPercent: Math.floor(playedPercent),
      earlyCompleteMinPercent: minPercent,
    };
  }

  async earlyComplete(context: {
    tournament: any;
    prisma: any;
    userId?: number;
    overrides?: { earlyCompleteMinPercent?: number };
  }): Promise<{
    tournament: any;
    shouldMarkComplete: boolean;
    message?: string;
  }> {
    const { tournament, prisma, overrides } = context;

    if (typeof overrides?.earlyCompleteMinPercent === 'number') {
      const { updateSystemConfig, getTournamentRulesConfig } = require('../services/systemConfigService');
      const current = getTournamentRulesConfig().roundRobin.earlyCompleteMinPercent;
      if (overrides.earlyCompleteMinPercent !== current) {
        await updateSystemConfig({
          tournamentRules: {
            roundRobin: {
              ...getTournamentRulesConfig().roundRobin,
              earlyCompleteMinPercent: overrides.earlyCompleteMinPercent,
            },
          },
        });
      }
    }

    const eligibility = await this.canEarlyComplete({
      tournament,
      prisma,
      overrides,
    });
    if (!eligibility.allowed) {
      throw new ClientHttpError(eligibility.reason || 'Early completion not allowed', 400);
    }

    const memberIds: number[] = (tournament.participants || []).map((p: any) => p.memberId);
    const existingByPair = new Map<string, any>();
    for (const match of tournament.matches || []) {
      if (!match.member2Id) continue;
      const key = [match.member1Id, match.member2Id].sort((a: number, b: number) => a - b).join('-');
      existingByPair.set(key, match);
    }

    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const m1 = memberIds[i];
        const m2 = memberIds[j];
        const key = [m1, m2].sort((a, b) => a - b).join('-');
        const existing = existingByPair.get(key);
        if (!existing) {
          await prisma.match.create({
            data: {
              tournamentId: tournament.id,
              member1Id: m1,
              member2Id: m2,
              player1Sets: 0,
              player2Sets: 0,
              player1Forfeit: false,
              player2Forfeit: false,
              notPlayed: true,
            },
          });
        } else if (!matchHasResult(existing)) {
          await prisma.match.update({
            where: { id: existing.id },
            data: {
              player1Sets: 0,
              player2Sets: 0,
              player1Forfeit: false,
              player2Forfeit: false,
              notPlayed: true,
            },
          });
        }
      }
    }

    const refreshed = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: {
        participants: { include: { member: true } },
        matches: true,
      },
    });

    return {
      tournament: refreshed,
      shouldMarkComplete: true,
      message: 'Round Robin early-completed; remaining matches marked NP',
    };
  }

  async onMatchCompleted(event: any): Promise<any> {
    const { tournament, prisma } = event;
    
    // Check if tournament is now complete
    if (this.isComplete(tournament)) {
      return { shouldMarkComplete: true };
    }
    
    return {};
  }

  async calculateMatchRatings(context: any): Promise<void> {
    // Round robin doesn't calculate ratings per match
    // Ratings are calculated when entire tournament completes
    return;
  }

  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement round robin schedule view
    return { matches: context.tournament.matches || [] };
  }

  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement round robin standings table
    return { standings: [] };
  }

  async updateMatch(context: {
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
  }> {
    const { matchId, tournamentId, member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit, prisma } = context;
    
    let match: any = null;
    
    // matchId > 0 means update existing match
    if (matchId > 0) {
      match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { tournament: true },
      });
      
      if (!match) {
        throw new Error('Match not found');
      }
      
      if (match.tournamentId !== tournamentId) {
        throw new Error('Match does not belong to this tournament');
      }
    }
    
    // Get member IDs from existing match or from context
    const m1Id = match?.member1Id ?? member1Id;
    const m2Id = match?.member2Id ?? member2Id;
    
    if (!m1Id || !m2Id) {
      throw new Error('member1Id and member2Id are required for match creation');
    }
    
    // Determine winner
    const winnerId = player1Forfeit 
      ? m2Id 
      : player2Forfeit 
        ? m1Id 
        : player1Sets > player2Sets 
          ? m1Id 
          : m2Id;
    
    let updatedMatch;
    
    if (match) {
      // Update existing match (clear NP when entering a real result)
      updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
          notPlayed: false,
        },
        include: { tournament: true },
      });
    } else {
      // Create new match — for round robin, matches are created lazily on first score entry
      try {
        updatedMatch = await prisma.match.create({
          data: {
            tournament: { connect: { id: tournamentId } },
            member1Id: m1Id,
            member2Id: m2Id,
            player1Sets,
            player2Sets,
            player1Forfeit,
            player2Forfeit,
            notPlayed: false,
          },
          include: { tournament: true },
        });
      } catch (error) {
        if (isDuplicateTournamentMatchError(error)) {
          throw await duplicateTournamentMatchErrorWithRecordedResult(prisma, tournamentId, m1Id, m2Id);
        }
        throw error;
      }
    }
    
    // Check if tournament is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: true },
    });
    
    const allMatchesComplete = this.isComplete(tournament);
    
    return {
      match: { ...updatedMatch, winnerId },
      tournamentStateChange: allMatchesComplete 
        ? { shouldMarkComplete: true, message: 'All matches completed' }
        : undefined,
    };
  }

  async onTournamentCompletionRatingCalculation(context: { tournament: any; prisma: any }): Promise<void> {
    await createRatingHistoryForRoundRobinTournament(context.tournament.id);
  }

  protected async getTournamentSpecificUpdateData(
    existingTournament: any,
    additionalData: Record<string, any> | undefined,
    prisma: any
  ): Promise<Record<string, any>> {
    // Round Robin tournaments don't have additional specific data to update
    return {};
  }

  async getCorrectionEligibility(context: { tournament: any; prisma: any }): Promise<CorrectionEligibility> {
    const { tournament, prisma } = context;
    if (tournament.cancelled) {
      return blockedCorrectionEligibility('Tournament was cancelled');
    }

    if (tournament.status === 'ACTIVE') {
      return buildActiveModificationEligibility(scoredMatchIds(tournament));
    }

    const compoundBlock = await getCompoundPreliminaryCorrectionBlockReason(prisma, tournament);
    if (compoundBlock) {
      return { allowed: false, reason: compoundBlock, correctableMatchIds: [] };
    }

    const ignoreTournamentIds = await getSiblingTournamentIds(prisma, tournament);
    const scoredIds = scoredMatchIds(tournament);
    const correctableMatchIds = await filterCorrectableMatchIdsByMemberDrift(
      prisma,
      tournament,
      scoredIds,
      ignoreTournamentIds,
    );

    if (correctableMatchIds.length === 0) {
      const driftReason = await findRatingDriftReason(prisma, tournament, { ignoreTournamentIds });
      if (driftReason) {
        return { allowed: false, reason: driftReason, correctableMatchIds: [] };
      }
      return { allowed: false, reason: 'No correctable matches in this tournament', correctableMatchIds: [] };
    }

    return { allowed: true, correctableMatchIds };
  }

  async assertMatchCorrectable(context: { tournament: any; match: any; prisma: any }): Promise<void> {
    const { tournament, match } = context;
    if (tournament.status !== 'COMPLETED' || tournament.cancelled) {
      throw new ClientHttpError('Tournament is not eligible for score correction', 400);
    }
    if (!matchHasResult(match)) {
      throw new ClientHttpError('Match has no result to correct', 400);
    }
  }
}
