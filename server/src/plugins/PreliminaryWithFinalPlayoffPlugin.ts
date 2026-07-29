import { 
  TournamentCreationContext,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { BaseCompoundTournamentPlugin } from './BaseCompoundTournamentPlugin';
import { createPlayoffBracketWithPositions } from '../services/playoffBracketService';
import { logger } from '../utils/logger';
import { matchHasCompetitiveResult } from '../utils/scoreCorrectionMatchUtils';

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

  validateCreateRules(_participantCount: number, data: any): string | null {
    // Lazy require avoids circular import via systemConfigService → index → registry
    const { getTournamentRulesConfig } = require('../services/systemConfigService');
    const rules = getTournamentRulesConfig().preliminary;
    const groupSize = Number(data?.groupSize ?? data?.additionalData?.groupSize);
    if (Number.isInteger(groupSize) && (groupSize < rules.groupSizeMin || groupSize > rules.groupSizeMax)) {
      return `Preliminary group size must be between ${rules.groupSizeMin} and ${rules.groupSizeMax}`;
    }
    return null;
  }

  isFinalPhaseChild(child: any): boolean {
    return child.type === 'PLAYOFF';
  }

  isPreliminaryGroupChild(child: any): boolean {
    return child.type === 'ROUND_ROBIN';
  }

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

  protected async recreateChildren(context: {
    tournamentId: number;
    name: string;
    participantIds: number[];
    players: any[];
    prisma: any;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    const { tournamentId, name, players, prisma, additionalData } = context;

    const finalSize = additionalData?.playoffBracketSize || 4;
    const groups: number[][] = additionalData?.groups || [];
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

    // Process matches (skip NP / unplayed — no W/L contribution)
    roundRobin.matches.forEach((match: any) => {
      if (!matchHasCompetitiveResult(match)) return;

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
    const preliminaryGroups = allChildren.filter((c: any) => this.isPreliminaryGroupChild(c));
    const finalTournament = allChildren.find((c: any) => this.isFinalPhaseChild(c));
    
    // If final exists and is complete, mark parent as complete (cancelled if final abandoned)
    if (finalTournament && finalTournament.status === 'COMPLETED') {
      return {
        shouldMarkComplete: true,
        shouldMarkCancelled: finalTournament.cancelled ? true : undefined,
      };
    }

    // If final already exists but not complete, nothing to do
    if (finalTournament) {
      return {};
    }

    const allPreliminariesComplete = preliminaryGroups.every((c: any) => c.status === 'COMPLETED');
    
    if (!allPreliminariesComplete) {
      return {};
    }

    // Exclude abandoned groups from qualification
    const activeGroups = preliminaryGroups.filter((c: any) => !c.cancelled);

    // Fetch config from dedicated table
    const config = parentTournament.preliminaryConfig 
      || await prisma.preliminaryConfig.findUnique({
        where: { tournamentId: parentTournament.id },
      });

    if (!config || !config.finalSize) {
      logger.error('Parent tournament missing PreliminaryConfig or finalSize', { tournamentId: parentTournament.id });
      return {};
    }

    const autoQualifiedMemberIds: number[] = config.autoQualifiedMemberIds || [];
    const maxEligible =
      autoQualifiedMemberIds.length +
      activeGroups.reduce((sum: number, g: any) => sum + (g.participants?.length ?? 0), 0);

    if (maxEligible === 0) {
      logger.info('All preliminary groups abandoned with no auto-qualified players; abandoning parent', {
        tournamentId: parentTournament.id,
      });
      return { shouldMarkComplete: true, shouldMarkCancelled: true };
    }

    const playoffBracketSize = Math.min(config.finalSize, maxEligible);

    // Calculate standings for each active group
    const groupResults: GroupResult[] = activeGroups.map((rr: any) => ({
      groupNumber: rr.groupNumber || 0,
      players: this.calculateGroupStandings(rr),
    }));

    // === Build the qualified players list ===
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
    const maxPlayersInGroup = groupResults.length > 0
      ? Math.max(...groupResults.map(g => g.players.length), 0)
      : 0;
    let placeIndex = 1; // 0-indexed: 1 = 2nd place, 2 = 3rd place, etc.

    while (remainingSlots > 0 && placeIndex < maxPlayersInGroup) {
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

    // Cap to shrunk bracket size (in case auto-qualified alone exceeded)
    if (qualifiedMemberIds.length > playoffBracketSize) {
      qualifiedMemberIds.length = playoffBracketSize;
    }

    if (qualifiedMemberIds.length === 0) {
      return { shouldMarkComplete: true, shouldMarkCancelled: true };
    }

    // === Seeding ===
    const allParentParticipants = parentTournament.participants || [];
    
    const playerInfoMap = new Map<number, { place: number; rating: number | null; isPrequalified: boolean }>();
    
    for (const memberId of autoQualifiedMemberIds) {
      const participant = allParentParticipants.find((p: any) => p.memberId === memberId);
      playerInfoMap.set(memberId, {
        place: 0,
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

    const seededIds: number[] = [];
    const restIds: number[] = [];

    const prequalified = autoQualifiedMemberIds
      .filter(id => qualifiedMemberIds.includes(id))
      .map(id => ({ id, rating: playerInfoMap.get(id)?.rating ?? 0 }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    seededIds.push(...prequalified.map(p => p.id));

    const firstPlaces = qualifiedMemberIds
      .filter(id => !autoQualifiedMemberIds.includes(id) && playerInfoMap.get(id)?.place === 1)
      .map(id => ({ id, rating: playerInfoMap.get(id)?.rating ?? 0 }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    seededIds.push(...firstPlaces.map(p => p.id));

    for (const id of qualifiedMemberIds) {
      if (!seededIds.includes(id)) {
        restIds.push(id);
      }
    }

    for (let i = restIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [restIds[i], restIds[j]] = [restIds[j], restIds[i]];
    }

    const allSeeded = [...seededIds, ...restIds];
    const bracketPositions: number[] = [];
    const numPlayers = allSeeded.length;
    for (let i = 0; i < Math.floor(numPlayers / 2); i++) {
      bracketPositions.push(allSeeded[i]);
      bracketPositions.push(allSeeded[numPlayers - 1 - i]);
    }
    if (numPlayers % 2 === 1) {
      bracketPositions.push(allSeeded[Math.floor(numPlayers / 2)]);
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

    await createPlayoffBracketWithPositions(
      playoffTournament.id,
      qualifiedMemberIds,
      bracketPositions
    );

    logger.info('Playoff tournament created from preliminary groups', {
      parentTournamentId: parentTournament.id,
      playoffTournamentId: playoffTournament.id,
      numQualified: qualifiedMemberIds.length,
      bracketSize: playoffBracketSize,
      configuredFinalSize: config.finalSize,
      abandonedGroups: preliminaryGroups.length - activeGroups.length,
      prequalified: autoQualifiedMemberIds.length,
    });

    const { emitTournamentUpdate, emitCacheInvalidation } = await import('../services/socketService');
    emitTournamentUpdate(playoffTournament);
    emitCacheInvalidation(parentTournament.id);
    emitCacheInvalidation(playoffTournament.id);

    return {
      message: 'Playoff bracket created from preliminary group results.',
    };
  }
}
