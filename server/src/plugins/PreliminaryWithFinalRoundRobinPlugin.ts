import { 
  TournamentCreationContext,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { BaseCompoundTournamentPlugin } from './BaseCompoundTournamentPlugin';
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

export class PreliminaryWithFinalRoundRobinPlugin extends BaseCompoundTournamentPlugin {
  type = 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN';

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const groups: number[][] = additionalData?.groups || [];
    const finalSize: number = additionalData?.finalRoundRobinSize || 6;
    const autoQualifiedCount: number = additionalData?.autoQualifiedCount || 0;
    const autoQualifiedMemberIds: number[] = additionalData?.autoQualifiedMemberIds || [];

    // Create main (parent) tournament
    const mainTournament = await prisma.tournament.create({
      data: {
        name,
        type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
        status: 'ACTIVE',
        // Parent tournament stores ALL participants (including auto-qualified)
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find((p: any) => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null,
            };
          }),
        },
        // Store configuration in dedicated table
        preliminaryConfig: {
          create: {
            finalSize,
            autoQualifiedCount,
            autoQualifiedMemberIds,
          },
        },
      },
    });

    // Create child Round Robin tournaments for each preliminary group
    await Promise.all(
      groups.map(async (group: number[], index: number) => {
        const groupPlayers = players.filter((p: any) => group.includes(p.id));
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
        preliminaryConfig: true,
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

  protected async recreateChildren(context: {
    tournamentId: number;
    name: string;
    participantIds: number[];
    players: any[];
    prisma: any;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    const { tournamentId, name, players, prisma, additionalData } = context;

    const groups: number[][] = additionalData?.groups || [];
    const finalSize: number = additionalData?.finalRoundRobinSize || 6;
    const autoQualifiedCount: number = additionalData?.autoQualifiedCount || 0;
    const autoQualifiedMemberIds: number[] = additionalData?.autoQualifiedMemberIds || [];

    // Re-create preliminary config
    await prisma.preliminaryConfig.create({
      data: {
        tournamentId,
        finalSize,
        autoQualifiedCount,
        autoQualifiedMemberIds,
      },
    });

    // Re-create child Round Robin tournaments for each preliminary group
    await Promise.all(
      groups.map(async (group: number[], index: number) => {
        const groupPlayers = players.filter((p: any) => group.includes(p.id));
        const groupName = `${name} - Group ${index + 1}`;

        return await this.createChildTournament(
          'ROUND_ROBIN',
          groupName,
          group,
          groupPlayers,
          tournamentId,
          index + 1,
          prisma
        );
      })
    );
  }

  protected async enrichTournamentConfig(tournament: any, prisma: any): Promise<any> {
    let enriched = { ...tournament };
    if (!tournament.preliminaryConfig) {
      const config = await prisma.preliminaryConfig.findUnique({
        where: { tournamentId: tournament.id },
      });
      if (config) {
        enriched.preliminaryConfig = config;
      }
    }
    return enriched;
  }

  protected hasFinalPhase(): boolean {
    return true;
  }

  /**
   * Calculate standings for a completed Round Robin child tournament.
   * Sorts by wins, then set difference, then rating.
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
    // Separate preliminary groups (have groupNumber) from the final (no groupNumber)
    const preliminaryGroups = allChildren.filter((c: any) => c.type === 'ROUND_ROBIN' && c.groupNumber !== null);
    const finalTournament = allChildren.find((c: any) => c.type === 'ROUND_ROBIN' && c.groupNumber === null);
    
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

    // === All preliminaries are done and no final exists yet — create the final round robin ===

    // Fetch config from dedicated table
    const config = parentTournament.preliminaryConfig 
      || await prisma.preliminaryConfig.findUnique({
        where: { tournamentId: parentTournament.id },
      });

    if (!config || !config.finalSize) {
      logger.error('Parent tournament missing PreliminaryConfig', { tournamentId: parentTournament.id });
      return {};
    }

    const finalRoundRobinSize = config.finalSize;
    const autoQualifiedMemberIds: number[] = config.autoQualifiedMemberIds || [];

    // Calculate standings for each group
    const groupResults: GroupResult[] = preliminaryGroups.map((rr: any) => ({
      groupNumber: rr.groupNumber || 0,
      players: this.calculateGroupStandings(rr),
    }));

    // Build the qualified players list
    const qualifiedMemberIds: number[] = [];

    // 1. Add auto-qualified players first
    qualifiedMemberIds.push(...autoQualifiedMemberIds);

    // 2. Add all 1st-place finishers from each group
    for (const group of groupResults) {
      if (group.players.length > 0) {
        const firstPlace = group.players[0];
        if (!qualifiedMemberIds.includes(firstPlace.memberId)) {
          qualifiedMemberIds.push(firstPlace.memberId);
        }
      }
    }

    // 3. Fill remaining slots from 2nd place, then 3rd, etc. — sorted by rating within each place
    let remainingSlots = finalRoundRobinSize - qualifiedMemberIds.length;
    let placeIndex = 1; // 0-indexed: 1 = 2nd place, 2 = 3rd place, etc.

    while (remainingSlots > 0 && placeIndex < Math.max(...groupResults.map(g => g.players.length))) {
      // Collect all players at this place across all groups
      const candidatesAtPlace: Array<{ memberId: number; rating: number | null; wins: number; setsDiff: number }> = [];

      for (const group of groupResults) {
        if (placeIndex < group.players.length) {
          const player = group.players[placeIndex];
          if (!qualifiedMemberIds.includes(player.memberId)) {
            candidatesAtPlace.push({
              memberId: player.memberId,
              rating: player.rating,
              wins: player.wins,
              setsDiff: player.setsWon - player.setsLost,
            });
          }
        }
      }

      // Sort candidates by rating (descending)
      candidatesAtPlace.sort((a, b) => {
        const ratingA = a.rating ?? 0;
        const ratingB = b.rating ?? 0;
        return ratingB - ratingA;
      });

      // Take as many as we need (or all if fewer than remaining slots)
      const toTake = Math.min(remainingSlots, candidatesAtPlace.length);
      for (let i = 0; i < toTake; i++) {
        qualifiedMemberIds.push(candidatesAtPlace[i].memberId);
      }
      remainingSlots = finalRoundRobinSize - qualifiedMemberIds.length;
      placeIndex++;
    }

    // Get player data for qualified members
    const allParentParticipants = parentTournament.participants || [];
    const qualifiedPlayers = qualifiedMemberIds.map((memberId: number) => {
      const participant = allParentParticipants.find((p: any) => p.memberId === memberId);
      return {
        memberId,
        rating: participant?.playerRatingAtTime ?? null,
      };
    });

    // Create the final Round Robin as a child tournament (groupNumber = null to distinguish from preliminary groups)
    const finalRR = await prisma.tournament.create({
      data: {
        name: `${parentTournament.name} - Final`,
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        parentTournamentId: parentTournament.id,
        // groupNumber is null — this distinguishes the final from preliminary groups
        participants: {
          create: qualifiedPlayers.map((player: any) => ({
            memberId: player.memberId,
            playerRatingAtTime: player.rating,
          })),
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

    logger.info('Final Round Robin created from preliminary groups', {
      parentTournamentId: parentTournament.id,
      finalTournamentId: finalRR.id,
      numQualified: qualifiedPlayers.length,
      autoQualified: autoQualifiedMemberIds.length,
      fromPreliminary: qualifiedPlayers.length - autoQualifiedMemberIds.length,
    });

    // Emit notifications
    const { emitTournamentUpdate, emitCacheInvalidation } = await import('../services/socketService');
    emitTournamentUpdate(finalRR);
    emitCacheInvalidation(parentTournament.id);
    emitCacheInvalidation(finalRR.id);

    return {
      message: 'Final Round Robin created from preliminary group results.',
    };
  }
}
