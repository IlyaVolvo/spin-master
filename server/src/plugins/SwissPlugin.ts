import { TournamentPlugin, TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';

export class SwissPlugin implements TournamentPlugin {
  type = 'SWISS';
  isBasic = true;

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const numberOfRounds = additionalData?.numberOfRounds || 3;
    const pairByRating = additionalData?.pairByRating ?? true;
    
    return await prisma.tournament.create({
      data: {
        name,
        type: 'SWISS',
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
        swissData: {
          create: {
            numberOfRounds,
            pairByRating,
            currentRound: 0,
            isCompleted: false,
          },
        },
      },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        swissData: true,
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
    // Swiss is complete when swissData indicates completion
    return tournament.swissData?.isCompleted === true;
  }

  shouldRecalculateRatings(tournament: any): boolean {
    // Swiss recalculates ratings after each match
    return true;
  }

  canDelete(tournament: any): boolean {
    return tournament.matches.length === 0;
  }

  canCancel(tournament: any): boolean {
    return true;
  }

  matchesRemaining(tournament: any): number {
    // Swiss: count unplayed matches in current round
    // When a round completes, new matches are generated for the next round
    // When all rounds are done, swissData.isCompleted = true
    if (tournament.swissData?.isCompleted) return 0;
    const currentRound = tournament.swissData?.currentRound ?? 0;
    const totalRounds = tournament.swissData?.numberOfRounds ?? 0;
    if (currentRound >= totalRounds) return 0;
    // Count matches in current round that haven't been played
    const currentRoundMatches = tournament.matches?.filter((m: any) => 
      m.round === currentRound
    ) || [];
    const unplayed = currentRoundMatches.filter((m: any) => m.winnerId === null).length;
    // Add estimated matches for future rounds
    const participantCount = tournament.participants?.length ?? 0;
    const matchesPerRound = Math.floor(participantCount / 2);
    const futureRounds = Math.max(0, totalRounds - currentRound - 1);
    return unplayed + (futureRounds * matchesPerRound);
  }

  async onMatchCompleted(event: any): Promise<any> {
    const { tournament, prisma } = event;
    
    // Check if all matches in current round are complete
    // This would trigger pairing generation for next round
    // For now, just check if tournament is complete
    if (this.isComplete(tournament)) {
      return { shouldMarkComplete: true };
    }
    
    return {};
  }

  async calculateMatchRatings(context: any): Promise<void> {
    const { tournament, match, prisma } = context;
    
    // Swiss calculates ratings after each match
    const { processMatchRating } = await import('../services/matchRatingService');
    const player1Won = match.player1Sets > match.player2Sets;
    
    await processMatchRating(
      match.member1Id,
      match.member2Id,
      player1Won,
      tournament.id,
      match.id,
      false, // not a forfeit
      false  // use playerRatingAtTime
    );
  }

  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement Swiss schedule view
    return { matches: context.tournament.matches || [] };
  }

  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement Swiss printable view
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
    const { matchId, tournamentId, player1Sets, player2Sets, player1Forfeit, player2Forfeit, prisma } = context;
    
    // Swiss matches are pre-created per round; update the existing match
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
    
    // Check if current round is complete and generate next round pairings
    // TODO: Implement Swiss round completion detection and next round pairing generation
    
    // Check if tournament is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: true },
    });
    
    const isComplete = this.isComplete(tournament);
    
    return {
      match: updatedMatch,
      tournamentStateChange: isComplete 
        ? { shouldMarkComplete: true, message: 'All rounds completed' }
        : undefined,
    };
  }
}
