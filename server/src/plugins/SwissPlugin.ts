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
}
