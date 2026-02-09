import { TournamentPlugin, TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';

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
    const { tournament } = context;
    return { ...tournament, bracketMatches: [] };
  }

  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, postRatingMap } = context;
    
    const participantsWithPostRating = tournament.participants.map((participant: any) => {
      const key = `${tournament.id}-${participant.memberId}`;
      const postRating = postRatingMap?.get(key) ?? participant.member.rating;
      return {
        ...participant,
        postRatingAtTime: postRating,
      };
    });

    return {
      ...tournament,
      participants: participantsWithPostRating,
      bracketMatches: [],
    };
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

  canDelete(tournament: any): boolean {
    return tournament.matches.length === 0;
  }

  canCancel(tournament: any): boolean {
    return true; // Can always cancel
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
    const { matchId, tournamentId, player1Sets, player2Sets, player1Forfeit, player2Forfeit, prisma } = context;
    
    // Find match directly
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });
    
    if (!match) {
      throw new Error('Match not found');
    }
    
    if (match.tournamentId !== tournamentId) {
      throw new Error('Match does not belong to this tournament');
    }
    
    // Determine winner
    const winnerId = player1Forfeit 
      ? match.member2Id 
      : player2Forfeit 
        ? match.member1Id 
        : player1Sets > player2Sets 
          ? match.member1Id 
          : match.member2Id;
    
    // Update match
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        player1Sets,
        player2Sets,
        player1Forfeit,
        player2Forfeit,
        winnerId,
      },
      include: { tournament: true },
    });
    
    // Check if tournament is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: true },
    });
    
    const allMatchesComplete = this.isComplete(tournament);
    
    return {
      match: updatedMatch,
      tournamentStateChange: allMatchesComplete 
        ? { shouldMarkComplete: true, message: 'All matches completed' }
        : undefined,
    };
  }
}
