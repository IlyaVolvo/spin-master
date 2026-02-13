import { TournamentPlugin, TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';
import { logger } from '../utils/logger';

interface PlayerStanding {
  memberId: number;
  points: number;
  rating: number;
  opponents: Set<number>;
}

export class SwissPlugin implements TournamentPlugin {
  type = 'SWISS';
  isBasic = true;

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const numberOfRounds = additionalData?.numberOfRounds || 3;
    
    // Create tournament with swissData config
    const tournament = await prisma.tournament.create({
      data: {
        name,
        type: 'SWISS',
        status: 'ACTIVE',
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find((p: any) => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null,
            };
          }),
        },
        swissData: {
          create: {
            numberOfRounds,
            currentRound: 0,
            isCompleted: false,
          },
        },
      },
      include: {
        participants: { include: { member: true } },
        matches: true,
        swissData: true,
      },
    });

    // Generate round 1 pairings immediately
    await this.generateNextRound(tournament.id, prisma);

    // Reload with matches
    return await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: {
        participants: { include: { member: true } },
        matches: true,
        swissData: true,
      },
    });
  }

  async enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, prisma } = context;
    // Ensure swissData is loaded
    let enriched = { ...tournament };
    if (!enriched.swissData) {
      const swissData = await prisma.swissTournamentData.findUnique({
        where: { tournamentId: tournament.id },
      });
      if (swissData) {
        enriched.swissData = swissData;
      }
    }
    return { ...enriched, bracketMatches: [] };
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

    let enriched = { ...tournament, participants: participantsWithPostRating };
    if (!enriched.swissData) {
      const swissData = await prisma.swissTournamentData.findUnique({
        where: { tournamentId: tournament.id },
      });
      if (swissData) {
        enriched.swissData = swissData;
      }
    }

    return { ...enriched, bracketMatches: [] };
  }

  isComplete(tournament: any): boolean {
    return tournament.swissData?.isCompleted === true;
  }

  shouldRecalculateRatings(_tournament: any): boolean {
    return false; // Swiss does not recalculate per-match ratings
  }

  canDelete(tournament: any): boolean {
    return !tournament.matches || tournament.matches.length === 0;
  }

  canCancel(_tournament: any): boolean {
    return true;
  }

  matchesRemaining(tournament: any): number {
    if (tournament.swissData?.isCompleted) return 0;
    const currentRound = tournament.swissData?.currentRound ?? 0;
    const totalRounds = tournament.swissData?.numberOfRounds ?? 0;
    const participantCount = tournament.participants?.length ?? 0;
    const matchesPerRound = Math.floor(participantCount / 2);

    // Unplayed matches in current round
    const currentRoundMatches = (tournament.matches || []).filter((m: any) => m.round === currentRound);
    const unplayed = currentRoundMatches.filter((m: any) => {
      const hasScore = m.player1Sets > 0 || m.player2Sets > 0;
      const hasForfeit = m.player1Forfeit || m.player2Forfeit;
      return !hasScore && !hasForfeit;
    }).length;

    const futureRounds = Math.max(0, totalRounds - currentRound);
    return unplayed + (futureRounds * matchesPerRound);
  }

  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    return { matches: context.tournament.matches || [] };
  }

  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    return { standings: [] };
  }

  /**
   * Calculate standings from all completed matches.
   * Returns players sorted by: points desc, then rating desc.
   */
  private calculateStandings(participants: any[], matches: any[]): PlayerStanding[] {
    const standingsMap = new Map<number, PlayerStanding>();

    // Initialize all participants with 0 points
    for (const p of participants) {
      standingsMap.set(p.memberId, {
        memberId: p.memberId,
        points: 0,
        rating: p.playerRatingAtTime ?? 0,
        opponents: new Set(),
      });
    }

    // Process completed matches
    for (const match of matches) {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      if (!hasScore && !hasForfeit) continue;

      const s1 = standingsMap.get(match.member1Id);
      const s2 = match.member2Id ? standingsMap.get(match.member2Id) : null;

      if (s1 && s2) {
        s1.opponents.add(match.member2Id);
        s2.opponents.add(match.member1Id);

        if (match.player1Forfeit) {
          s2.points += 1;
        } else if (match.player2Forfeit) {
          s1.points += 1;
        } else if (match.player1Sets > match.player2Sets) {
          s1.points += 1;
        } else if (match.player2Sets > match.player1Sets) {
          s2.points += 1;
        }
      }
    }

    // Sort by points desc, then rating desc
    return Array.from(standingsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.rating - a.rating;
    });
  }

  /**
   * Swiss pairing algorithm:
   * Start with the first player in standings. Find the lowest-ranked player
   * in the same point group they haven't played. If none, go to the next group.
   * Remove both from consideration. Repeat.
   */
  private generatePairings(standings: PlayerStanding[]): Array<[number, number]> {
    const pairings: Array<[number, number]> = [];
    const unpaired = [...standings]; // mutable copy

    while (unpaired.length >= 2) {
      const player = unpaired.shift()!; // take first (highest ranked unpaired)

      // Group by points: same point group first, then lower groups
      // Within the same group, find the lowest-ranked player they haven't played
      let pairedIndex = -1;

      // First: try same point group, lowest ranked (last in the subarray)
      const sameGroupIndices: number[] = [];
      const lowerGroupIndices: number[] = [];

      for (let i = 0; i < unpaired.length; i++) {
        if (!player.opponents.has(unpaired[i].memberId)) {
          if (unpaired[i].points === player.points) {
            sameGroupIndices.push(i);
          } else {
            lowerGroupIndices.push(i);
          }
        }
      }

      // Pick the lowest-ranked in same group (last index in sameGroupIndices)
      if (sameGroupIndices.length > 0) {
        pairedIndex = sameGroupIndices[sameGroupIndices.length - 1];
      } else if (lowerGroupIndices.length > 0) {
        // Pick the lowest-ranked in the next point group
        pairedIndex = lowerGroupIndices[lowerGroupIndices.length - 1];
      }

      if (pairedIndex >= 0) {
        const opponent = unpaired.splice(pairedIndex, 1)[0];
        pairings.push([player.memberId, opponent.memberId]);
      } else {
        // No valid opponent found — this player gets a bye (skip)
        // In a proper Swiss with even players this shouldn't happen
        logger.warn('Swiss pairing: no valid opponent found', { memberId: player.memberId });
      }
    }

    return pairings;
  }

  /**
   * Generate the next round of Swiss pairings.
   * Called after tournament creation (round 1) and after each round completes.
   */
  async generateNextRound(tournamentId: number, prisma: any): Promise<any> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: { include: { member: true } },
        matches: true,
        swissData: true,
      },
    });

    if (!tournament || !tournament.swissData) {
      throw new Error('Tournament or Swiss config not found');
    }

    const currentRound = tournament.swissData.currentRound;
    const numberOfRounds = tournament.swissData.numberOfRounds;

    if (currentRound >= numberOfRounds) {
      throw new Error('All rounds have been completed');
    }

    const newRound = currentRound + 1;

    // Calculate standings from all matches so far
    const standings = this.calculateStandings(tournament.participants, tournament.matches);

    // Generate pairings
    const pairings = this.generatePairings(standings);

    if (pairings.length === 0) {
      throw new Error('Could not generate any pairings');
    }

    // Create matches for this round
    await Promise.all(
      pairings.map(([member1Id, member2Id]) =>
        prisma.match.create({
          data: {
            tournament: { connect: { id: tournamentId } },
            member1Id,
            member2Id,
            round: newRound,
          },
        })
      )
    );

    // Update currentRound
    const isLastRound = newRound >= numberOfRounds;
    await prisma.swissTournamentData.update({
      where: { tournamentId },
      data: {
        currentRound: newRound,
        // Don't mark completed yet — that happens when all matches in last round are done
      },
    });

    logger.info('Swiss round generated', {
      tournamentId,
      round: newRound,
      pairings: pairings.length,
      isLastRound,
    });

    // Return updated tournament
    return await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: { include: { member: true } },
        matches: true,
        swissData: true,
      },
    });
  }

  /**
   * Check if all matches in the current round are complete.
   */
  private isCurrentRoundComplete(tournament: any): boolean {
    const currentRound = tournament.swissData?.currentRound ?? 0;
    if (currentRound === 0) return false;

    const roundMatches = (tournament.matches || []).filter((m: any) => m.round === currentRound);
    if (roundMatches.length === 0) return false;

    return roundMatches.every((m: any) => {
      const hasScore = m.player1Sets > 0 || m.player2Sets > 0;
      const hasForfeit = m.player1Forfeit || m.player2Forfeit;
      return hasScore || hasForfeit;
    });
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
    
    const match = await prisma.match.findUnique({
      where: { id: matchId },
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
      },
      include: { tournament: true },
    });
    
    // Reload tournament with all data to check round completion
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: { include: { member: true } },
        matches: true,
        swissData: true,
      },
    });

    // Check if current round is now complete
    if (this.isCurrentRoundComplete(tournament)) {
      const currentRound = tournament.swissData.currentRound;
      const numberOfRounds = tournament.swissData.numberOfRounds;

      if (currentRound >= numberOfRounds) {
        // All rounds done — mark Swiss as completed
        await prisma.swissTournamentData.update({
          where: { tournamentId },
          data: { isCompleted: true },
        });

        return {
          match: { ...updatedMatch, winnerId },
          tournamentStateChange: { shouldMarkComplete: true, message: 'All Swiss rounds completed' },
        };
      } else {
        // Generate next round automatically
        await this.generateNextRound(tournamentId, prisma);
      }
    }
    
    return {
      match: { ...updatedMatch, winnerId },
    };
  }
}
