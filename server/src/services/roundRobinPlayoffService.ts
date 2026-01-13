/**
 * Service for managing Round Robin + Playoff tournaments
 * Handles automatic playoff creation when all Round Robin groups are completed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { logger } from '../utils/logger';
import { createPlayoffBracketWithPositions } from './playoffBracketService';

interface GroupResult {
  groupNumber: number;
  players: Array<{
    memberId: number;
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
    rating: number | null;
    place: number;
  }>;
}

/**
 * Calculate standings for a Round Robin tournament
 */
async function calculateRoundRobinStandings(tournamentId: number): Promise<GroupResult['players']> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: {
        include: { member: true },
      },
      matches: true,
    },
  });

  if (!tournament) {
    throw new Error(`Tournament ${tournamentId} not found`);
  }

  const standings = new Map<number, {
    memberId: number;
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
    rating: number | null;
  }>();

  // Initialize standings for all participants
  tournament.participants.forEach(p => {
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
  tournament.matches.forEach(match => {
    if (match.player1Forfeit || match.player2Forfeit) {
      // Handle forfeits
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
      // Normal match
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

  // Convert to array and sort by wins, then sets difference, then rating
  const sorted = Array.from(standings.values()).sort((a, b) => {
    // First by wins
    if (b.wins !== a.wins) return b.wins - a.wins;
    // Then by sets difference
    const diffA = a.setsWon - a.setsLost;
    const diffB = b.setsWon - b.setsLost;
    if (diffB !== diffA) return diffB - diffA;
    // Finally by rating
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    return ratingB - ratingA;
  });

  // Assign places
  return sorted.map((player, index) => ({
    ...player,
    place: index + 1,
  }));
}

/**
 * Check if all Round Robin groups are completed and create playoff if so
 */
export async function checkAndCreatePlayoff(parentTournamentId: number): Promise<void> {
  try {
    const parentTournament = await prisma.tournament.findUnique({
      where: { id: parentTournamentId },
      include: {
        childTournaments: {
          include: {
            participants: {
              include: { member: true },
            },
            matches: true,
          },
        },
      },
    });

    if (!parentTournament || parentTournament.type !== 'PRELIMINARY_AND_PLAYOFF') {
      return; // Not a PRELIMINARY_AND_PLAYOFF tournament
    }

    if (!parentTournament.roundRobinSize || !parentTournament.playoffBracketSize) {
      logger.error('PRELIMINARY_AND_PLAYOFF tournament missing configuration', { tournamentId: parentTournamentId });
      return;
    }

    // Check if playoff already exists
    const existingPlayoff = await prisma.tournament.findFirst({
      where: {
        parentTournamentId: parentTournamentId,
        type: 'PLAYOFF',
      },
    });

    if (existingPlayoff) {
      return; // Playoff already created
    }

    // Check if all Round Robin tournaments are completed
    const allRoundRobins = parentTournament.childTournaments.filter(t => t.type === 'ROUND_ROBIN');
    const completedRoundRobins = allRoundRobins.filter(t => t.status === 'COMPLETED');

    if (completedRoundRobins.length !== allRoundRobins.length) {
      return; // Not all Round Robins are completed yet
    }

    // Calculate standings for each group
    const groupResults: GroupResult[] = [];
    for (const roundRobin of allRoundRobins) {
      const standings = await calculateRoundRobinStandings(roundRobin.id);
      groupResults.push({
        groupNumber: roundRobin.groupNumber || 0,
        players: standings,
      });
    }

    // Determine qualification: top X from each group + highest rated 3rd place players
    const numGroups = groupResults.length;
    const playoffSize = parentTournament.playoffBracketSize;
    const playersPerGroup = Math.floor(playoffSize / numGroups);
    const remainingSpots = playoffSize - (playersPerGroup * numGroups);

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

    // Add remaining spots from 3rd place players (highest rated)
    if (remainingSpots > 0) {
      const thirdPlacePlayers = groupResults
        .map(group => {
          const thirdPlace = group.players.find(p => p.place === 3);
          if (thirdPlace) {
            return {
              memberId: thirdPlace.memberId,
              groupNumber: group.groupNumber,
              place: 3,
              rating: thirdPlace.rating,
              wins: thirdPlace.wins,
              setsDiff: thirdPlace.setsWon - thirdPlace.setsLost,
            };
          }
          return null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => {
          // Sort by rating (highest first)
          const ratingA = a.rating ?? 0;
          const ratingB = b.rating ?? 0;
          return ratingB - ratingA;
        });

      // Take top remainingSpots
      qualifiedPlayers.push(...thirdPlacePlayers.slice(0, remainingSpots));
    }

    // Seed players: sort by place, then by rating within same place
    const seededPlayers = qualifiedPlayers.sort((a, b) => {
      // First by place (1st place before 2nd place, etc.)
      if (a.place !== b.place) {
        return a.place - b.place;
      }
      // Within same place, by rating (highest first)
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      return ratingB - ratingA;
    });

    // Pair players: 1st with last, 2nd with 2nd-to-last, etc.
    const bracketPositions: Array<number | null> = [];
    const numPlayers = seededPlayers.length;
    
    for (let i = 0; i < numPlayers / 2; i++) {
      bracketPositions.push(seededPlayers[i].memberId);
      bracketPositions.push(seededPlayers[numPlayers - 1 - i].memberId);
    }

    // Create playoff tournament
    const playoffTournament = await prisma.tournament.create({
      data: {
        name: `${parentTournament.name} - Playoff`,
        type: 'PLAYOFF',
        status: 'ACTIVE',
        parentTournamentId: parentTournamentId,
        participants: {
          create: seededPlayers.map(player => ({
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

    logger.info('Playoff tournament created automatically', {
      parentTournamentId,
      playoffTournamentId: playoffTournament.id,
      numQualified: seededPlayers.length,
    });

    // Emit notifications
    const { emitTournamentUpdate, emitCacheInvalidation } = await import('./socketService');
    emitTournamentUpdate(playoffTournament);
    emitCacheInvalidation(parentTournamentId);
    emitCacheInvalidation(playoffTournament.id);
  } catch (error) {
    logger.error('Error checking and creating playoff', {
      error: error instanceof Error ? error.message : String(error),
      parentTournamentId,
    });
  }
}
