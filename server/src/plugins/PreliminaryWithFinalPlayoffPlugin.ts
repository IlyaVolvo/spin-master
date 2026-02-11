import { 
  TournamentCreationContext,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { BaseCompoundTournamentPlugin } from './BaseCompoundTournamentPlugin';
import { createPlayoffBracketWithPositions } from '../services/playoffBracketService';
import { logger } from '../utils/logger';

interface GroupStanding {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  rating: number | null;
  place: number;
}

interface GroupResult {
  groupNumber: number;
  players: GroupStanding[];
}

export class PreliminaryWithFinalPlayoffPlugin extends BaseCompoundTournamentPlugin {
  type = 'PRELIMINARY_WITH_FINAL_PLAYOFF';

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const roundRobinSize = additionalData?.roundRobinSize || 4;
    const playoffBracketSize = additionalData?.playoffBracketSize || 4;
    const groups = additionalData?.groups || [];

    // Create main tournament
    const mainTournament = await prisma.tournament.create({
      data: {
        name,
        type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
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
    });

    // Create child Round Robin tournaments for each group using base class helper
    await Promise.all(
      groups.map(async (group: number[], index: number) => {
        const groupPlayers = players.filter(p => group.includes(p.id));
        const groupName = `${name} - Group ${index + 1}`;
        
        return await this.createChildTournament(
          'ROUND_ROBIN',
          groupName,
          group,
          groupPlayers,
          mainTournament.id,
          index + 1,
          prisma
        );
      })
    );

    // Reload main tournament with all data
    return await prisma.tournament.findUnique({
      where: { id: mainTournament.id },
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
  }

  protected hasFinalPhase(): boolean {
    return true;
  }

  /**
   * Calculate standings for a completed Round Robin child tournament
   */
  private calculateGroupStandings(roundRobin: any): GroupStanding[] {
    const standings = new Map<number, {
      memberId: number;
      wins: number;
      losses: number;
      setsWon: number;
      setsLost: number;
      rating: number | null;
    }>();

    // Initialize standings for all participants
    roundRobin.participants.forEach((p: any) => {
      standings.set(p.memberId, {
        memberId: p.memberId,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        rating: p.playerRatingAtTime,
      });
    });

    // Process matches
    roundRobin.matches.forEach((match: any) => {
      if (match.player1Forfeit || match.player2Forfeit) {
        if (match.player1Forfeit) {
          const p1 = standings.get(match.member1Id);
          const p2 = standings.get(match.member2Id!);
          if (p1) { p1.losses++; }
          if (p2) { p2.wins++; }
        } else {
          const p1 = standings.get(match.member1Id);
          const p2 = standings.get(match.member2Id!);
          if (p1) { p1.wins++; }
          if (p2) { p2.losses++; }
        }
      } else {
        const p1 = standings.get(match.member1Id);
        const p2 = standings.get(match.member2Id!);
        
        if (p1 && p2) {
          p1.setsWon += match.player1Sets;
          p1.setsLost += match.player2Sets;
          p2.setsWon += match.player2Sets;
          p2.setsLost += match.player1Sets;

          if (match.player1Sets > match.player2Sets) {
            p1.wins++;
            p2.losses++;
          } else {
            p1.losses++;
            p2.wins++;
          }
        }
      }
    });

    // Sort by wins, then sets difference, then rating
    const sorted = Array.from(standings.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const diffA = a.setsWon - a.setsLost;
      const diffB = b.setsWon - b.setsLost;
      if (diffB !== diffA) return diffB - diffA;
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      return ratingB - ratingA;
    });

    return sorted.map((player, index) => ({
      ...player,
      place: index + 1,
    }));
  }

  protected async handleFinalPhaseLogic(
    parentTournament: any,
    allChildren: any[],
    prisma: any
  ): Promise<TournamentStateChangeResult> {
    const preliminaryGroups = allChildren.filter((c: any) => c.type === 'ROUND_ROBIN');
    const finalTournament = allChildren.find((c: any) => c.type === 'PLAYOFF');
    
    // If final exists and is complete, mark parent as complete
    if (finalTournament && finalTournament.status === 'COMPLETED') {
      return { shouldMarkComplete: true };
    }

    // If final already exists but not complete, nothing to do
    if (finalTournament) {
      return {};
    }

    const allPreliminariesComplete = preliminaryGroups.every((c: any) => c.status === 'COMPLETED');
    
    if (!allPreliminariesComplete) {
      return {};
    }

    // All preliminaries are done and no final exists yet — create the playoff

    const playoffBracketSize = parentTournament.playoffBracketSize;
    if (!playoffBracketSize) {
      logger.error('Parent tournament missing playoffBracketSize', { tournamentId: parentTournament.id });
      return {};
    }

    // Calculate standings for each group
    const groupResults: GroupResult[] = preliminaryGroups.map((rr: any) => ({
      groupNumber: rr.groupNumber || 0,
      players: this.calculateGroupStandings(rr),
    }));

    // Determine qualification: top X from each group + highest rated remaining players
    const numGroups = groupResults.length;
    const playersPerGroup = Math.floor(playoffBracketSize / numGroups);
    const remainingSpots = playoffBracketSize - (playersPerGroup * numGroups);

    const qualifiedPlayers: Array<{
      memberId: number;
      groupNumber: number;
      place: number;
      rating: number | null;
      wins: number;
      setsDiff: number;
    }> = [];

    // Add top X players from each group
    groupResults.forEach(group => {
      for (let i = 0; i < playersPerGroup && i < group.players.length; i++) {
        const player = group.players[i];
        qualifiedPlayers.push({
          memberId: player.memberId,
          groupNumber: group.groupNumber,
          place: player.place,
          rating: player.rating,
          wins: player.wins,
          setsDiff: player.setsWon - player.setsLost,
        });
      }
    });

    // Fill remaining spots from next-best players across groups (highest rated)
    if (remainingSpots > 0) {
      const nextPlaceIndex = playersPerGroup; // 0-indexed place after the already-qualified
      const nextPlacePlayers = groupResults
        .map(group => {
          const player = group.players[nextPlaceIndex];
          if (player) {
            return {
              memberId: player.memberId,
              groupNumber: group.groupNumber,
              place: player.place,
              rating: player.rating,
              wins: player.wins,
              setsDiff: player.setsWon - player.setsLost,
            };
          }
          return null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => {
          const ratingA = a.rating ?? 0;
          const ratingB = b.rating ?? 0;
          return ratingB - ratingA;
        });

      qualifiedPlayers.push(...nextPlacePlayers.slice(0, remainingSpots));
    }

    // Seed players: sort by place, then by rating within same place
    const seededPlayers = qualifiedPlayers.sort((a, b) => {
      if (a.place !== b.place) return a.place - b.place;
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      return ratingB - ratingA;
    });

    // Build bracket positions: 1st vs last, 2nd vs 2nd-to-last, etc.
    const bracketPositions: Array<number | null> = [];
    const numPlayers = seededPlayers.length;
    for (let i = 0; i < numPlayers / 2; i++) {
      bracketPositions.push(seededPlayers[i].memberId);
      bracketPositions.push(seededPlayers[numPlayers - 1 - i].memberId);
    }

    // Create playoff tournament as child of parent
    const playoffTournament = await prisma.tournament.create({
      data: {
        name: `${parentTournament.name} - Playoff`,
        type: 'PLAYOFF',
        status: 'ACTIVE',
        parentTournamentId: parentTournament.id,
        participants: {
          create: seededPlayers.map((player: any) => ({
            memberId: player.memberId,
            playerRatingAtTime: player.rating,
          })),
        },
      },
    });

    // Create bracket
    await createPlayoffBracketWithPositions(
      playoffTournament.id,
      seededPlayers.map(p => p.memberId),
      bracketPositions
    );

    logger.info('Playoff tournament created from preliminary groups', {
      parentTournamentId: parentTournament.id,
      playoffTournamentId: playoffTournament.id,
      numQualified: seededPlayers.length,
    });

    // Emit notifications
    const { emitTournamentUpdate, emitCacheInvalidation } = await import('../services/socketService');
    emitTournamentUpdate(playoffTournament);
    emitCacheInvalidation(parentTournament.id);
    emitCacheInvalidation(playoffTournament.id);

    return {
      message: 'Playoff bracket created from preliminary group results.',
    };
  }
}
