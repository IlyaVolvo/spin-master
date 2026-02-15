import { TournamentPlugin, TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';
import { createRatingHistoryForRoundRobinTournament, adjustRatingsForSingleMatch } from '../services/usattRatingService';

export class RoundRobinPlugin implements TournamentPlugin {
  type = 'ROUND_ROBIN';
  isBasic = true;

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

    // Attach rating history to matches
    if (prisma) {
      await this.attachRatingHistoryToMatches(tournament.matches, prisma);
    }

    return { ...tournament, bracketMatches: [] };
  }

  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, postRatingMap, prisma } = context;
    
    const participantsWithPostRating = tournament.participants.map((participant: any) => {
      const key = `${tournament.id}-${participant.memberId}`;
      const postRating = postRatingMap?.get(key) ?? participant.member.rating;
      return {
        ...participant,
        postRatingAtTime: postRating,
      };
    });

    // Attach rating history to matches
    if (prisma) {
      await this.attachRatingHistoryToMatches(tournament.matches, prisma);
    }

    return {
      ...tournament,
      participants: participantsWithPostRating,
      bracketMatches: [],
    };
  }

  private async attachRatingHistoryToMatches(matches: any[], prisma: any): Promise<void> {
    const matchIds = (matches || [])
      .filter((m: any) => m.id)
      .map((m: any) => m.id);

    if (matchIds.length === 0) return;

    const allRatingHistory = await prisma.ratingHistory.findMany({
      where: { matchId: { in: matchIds } },
    });

    const historyByMatch = new Map<number, any[]>();
    for (const h of allRatingHistory) {
      if (!h.matchId) continue;
      if (!historyByMatch.has(h.matchId)) historyByMatch.set(h.matchId, []);
      historyByMatch.get(h.matchId)!.push(h);
    }

    for (const match of matches) {
      const entries = historyByMatch.get(match.id) || [];
      const h1 = entries.find((e: any) => e.memberId === match.member1Id);
      const h2 = entries.find((e: any) => e.memberId === match.member2Id);
      match.player1RatingBefore = h1 ? h1.rating - h1.ratingChange : null;
      match.player1RatingChange = h1 ? h1.ratingChange : null;
      match.player2RatingBefore = h2 ? h2.rating - h2.ratingChange : null;
      match.player2RatingChange = h2 ? h2.ratingChange : null;
    }
  }

  isComplete(tournament: any): boolean {
    // Round robin is complete when all matches are played
    if (!tournament.participants || tournament.participants.length < 2) {
      return false;
    }
    
    const expectedMatches = (tournament.participants.length * (tournament.participants.length - 1)) / 2;
    const playedMatches = tournament.matches?.filter((m: any) => 
      m.player1Sets !== null && m.player2Sets !== null
    ).length || 0;
    
    return playedMatches >= expectedMatches;
  }

  shouldRecalculateRatings(tournament: any): boolean {
    // Round robin recalculates ratings only when tournament completes
    return this.isComplete(tournament) && tournament.status !== 'COMPLETED';
  }

  async onMatchRatingCalculation(context: { tournament: any; match: any; winnerId: number; prisma: any }): Promise<void> {
    const { match, prisma } = context;
    const isForfeit = match.player1Forfeit || match.player2Forfeit;
    if (isForfeit || !match.member1Id || !match.member2Id) return;

    // Delete any existing rating history for this match (handles re-scoring)
    await prisma.ratingHistory.deleteMany({
      where: { matchId: match.id },
    });

    const player1Won = match.winnerId === match.member1Id;
    await adjustRatingsForSingleMatch(
      match.member1Id,
      match.member2Id,
      player1Won,
      match.tournamentId,
      match.id,
    );
  }

  canCancel(tournament: any): boolean {
    return true; // Can always cancel
  }

  matchesRemaining(tournament: any): number {
    if (!tournament.participants || tournament.participants.length < 2) {
      return 0;
    }
    const expectedMatches = (tournament.participants.length * (tournament.participants.length - 1)) / 2;
    const playedMatches = tournament.matches?.filter((m: any) => 
      (m.player1Sets !== null && m.player2Sets !== null) &&
      (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
    ).length || 0;
    return Math.max(0, expectedMatches - playedMatches);
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
      // Update existing match
      updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
        },
        include: { tournament: true },
      });
    } else {
      // Create new match — for round robin, all matches are pre-created at tournament creation
      // This path handles the case where a match needs to be created (legacy support)
      updatedMatch = await prisma.match.create({
        data: {
          tournament: { connect: { id: tournamentId } },
          member1Id: m1Id,
          member2Id: m2Id,
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
        },
        include: { tournament: true },
      });
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
}
