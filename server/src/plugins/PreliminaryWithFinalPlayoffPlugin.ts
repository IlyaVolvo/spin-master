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
    
    const finalSize = additionalData?.playoffBracketSize || 4;
    const groups: number[][] = additionalData?.groups || [];
    const autoQualifiedCount: number = additionalData?.autoQualifiedCount || 0;
    const autoQualifiedMemberIds: number[] = additionalData?.autoQualifiedMemberIds || [];

    // Create main (parent) tournament
    const mainTournament = await prisma.tournament.create({
      data: {
        name,
        type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
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

    // === All preliminaries are done and no final exists yet — create the playoff ===

    // Fetch config from dedicated table
    const config = parentTournament.preliminaryConfig 
      || await prisma.preliminaryConfig.findUnique({
        where: { tournamentId: parentTournament.id },
      });

    if (!config || !config.finalSize) {
      logger.error('Parent tournament missing PreliminaryConfig or finalSize', { tournamentId: parentTournament.id });
      return {};
    }

    const playoffBracketSize = config.finalSize;
    const autoQualifiedMemberIds: number[] = config.autoQualifiedMemberIds || [];

    // Calculate standings for each group
    const groupResults: GroupResult[] = preliminaryGroups.map((rr: any) => ({
      groupNumber: rr.groupNumber || 0,
      players: this.calculateGroupStandings(rr),
    }));

    // === Build the qualified players list ===
    // Qualification order:
    // 1. Prequalified players
    // 2. All 1st-place finishers from each group
    // 3. Fill remaining from 2nd place (sorted by rating desc), then 3rd, etc.

    const qualifiedMemberIds: number[] = [];

    // 1. Add prequalified players first
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
    let remainingSlots = playoffBracketSize - qualifiedMemberIds.length;
    let placeIndex = 1; // 0-indexed: 1 = 2nd place, 2 = 3rd place, etc.

    while (remainingSlots > 0 && placeIndex < Math.max(...groupResults.map(g => g.players.length))) {
      // Collect all players at this place across all groups
      const candidatesAtPlace: Array<{ memberId: number; rating: number | null }> = [];

      for (const group of groupResults) {
        if (placeIndex < group.players.length) {
          const player = group.players[placeIndex];
          if (!qualifiedMemberIds.includes(player.memberId)) {
            candidatesAtPlace.push({
              memberId: player.memberId,
              rating: player.rating,
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

      // Take as many as we need
      const toTake = Math.min(remainingSlots, candidatesAtPlace.length);
      for (let i = 0; i < toTake; i++) {
        qualifiedMemberIds.push(candidatesAtPlace[i].memberId);
      }
      remainingSlots = playoffBracketSize - qualifiedMemberIds.length;
      placeIndex++;
    }

    // === Seeding ===
    // Build seeded list with metadata for ordering
    const allParentParticipants = parentTournament.participants || [];
    
    // Determine each qualified player's group standing info
    const playerInfoMap = new Map<number, { place: number; rating: number | null; isPrequalified: boolean }>();
    
    for (const memberId of autoQualifiedMemberIds) {
      const participant = allParentParticipants.find((p: any) => p.memberId === memberId);
      playerInfoMap.set(memberId, {
        place: 0, // Prequalified = highest seed priority
        rating: participant?.playerRatingAtTime ?? null,
        isPrequalified: true,
      });
    }
    
    for (const group of groupResults) {
      for (const player of group.players) {
        if (qualifiedMemberIds.includes(player.memberId) && !playerInfoMap.has(player.memberId)) {
          playerInfoMap.set(player.memberId, {
            place: player.place,
            rating: player.rating,
            isPrequalified: false,
          });
        }
      }
    }

    // Seeding order: prequalified first, then 1st places by rating desc, then 2nd places by rating desc, etc.
    // The "seeded" portion = prequalified + 1st places
    // The "rest" = 2nd places and beyond → take random remaining slots
    
    const seededIds: number[] = [];
    const restIds: number[] = [];

    // Prequalified players sorted by rating desc
    const prequalified = autoQualifiedMemberIds
      .filter(id => qualifiedMemberIds.includes(id))
      .map(id => ({ id, rating: playerInfoMap.get(id)?.rating ?? 0 }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    seededIds.push(...prequalified.map(p => p.id));

    // 1st-place finishers sorted by rating desc
    const firstPlaces = qualifiedMemberIds
      .filter(id => !autoQualifiedMemberIds.includes(id) && playerInfoMap.get(id)?.place === 1)
      .map(id => ({ id, rating: playerInfoMap.get(id)?.rating ?? 0 }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    seededIds.push(...firstPlaces.map(p => p.id));

    // Everyone else (2nd place+) goes to "rest" — they take random remaining slots
    for (const id of qualifiedMemberIds) {
      if (!seededIds.includes(id)) {
        restIds.push(id);
      }
    }

    // Shuffle the rest randomly
    for (let i = restIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [restIds[i], restIds[j]] = [restIds[j], restIds[i]];
    }

    // Build bracket positions using standard seeding pattern:
    // Seed 1 vs Seed N, Seed 2 vs Seed N-1, etc.
    // Seeded players get top seeds, rest fill remaining positions
    const allSeeded = [...seededIds, ...restIds];
    const bracketPositions: number[] = [];
    const numPlayers = allSeeded.length;
    for (let i = 0; i < numPlayers / 2; i++) {
      bracketPositions.push(allSeeded[i]);
      bracketPositions.push(allSeeded[numPlayers - 1 - i]);
    }

    // Create playoff tournament as child of parent
    const playoffTournament = await prisma.tournament.create({
      data: {
        name: `${parentTournament.name} - Playoff`,
        type: 'PLAYOFF',
        status: 'ACTIVE',
        parentTournamentId: parentTournament.id,
        participants: {
          create: qualifiedMemberIds.map((memberId: number) => {
            const participant = allParentParticipants.find((p: any) => p.memberId === memberId);
            return {
              memberId,
              playerRatingAtTime: participant?.playerRatingAtTime ?? null,
            };
          }),
        },
      },
    });

    // Create bracket — no BYEs since bracket size = number of qualified players
    await createPlayoffBracketWithPositions(
      playoffTournament.id,
      qualifiedMemberIds,
      bracketPositions
    );

    logger.info('Playoff tournament created from preliminary groups', {
      parentTournamentId: parentTournament.id,
      playoffTournamentId: playoffTournament.id,
      numQualified: qualifiedMemberIds.length,
      bracketSize: playoffBracketSize,  // = config.finalSize
      prequalified: autoQualifiedMemberIds.length,
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
