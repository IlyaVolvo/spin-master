import { Tournament, Match, Member, TournamentParticipant } from '../../../types/tournament';

/**
 * Compute per-group capacities when players aren't evenly divisible by desiredSize.
 * Maximizes the number of smaller (desiredSize - 1) groups so the rest are exactly desiredSize.
 *
 * Example: 18 players, desiredSize 5 → 4 groups: 2×4 + 2×5.
 *          10 players, desiredSize 5 → 2 groups: 2×5.
 *
 * Smaller groups are chosen at random positions.
 */
export function computeGroupCapacities(totalPlayers: number, desiredSize: number): number[] {
  if (totalPlayers <= 0 || desiredSize <= 0) return [];
  if (desiredSize >= totalPlayers) return [totalPlayers]; // single group

  const numGroups = Math.ceil(totalPlayers / desiredSize);
  const numSmaller = numGroups * desiredSize - totalPlayers; // groups of (desiredSize - 1)
  const numFull = numGroups - numSmaller;                    // groups of desiredSize

  // Build array: numFull groups of desiredSize, numSmaller groups of (desiredSize - 1)
  const capacities: number[] = [
    ...Array(numFull).fill(desiredSize),
    ...Array(numSmaller).fill(desiredSize - 1),
  ];

  // Shuffle to randomize which groups are smaller
  for (let i = capacities.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [capacities[i], capacities[j]] = [capacities[j], capacities[i]];
  }

  return capacities;
}

/**
 * Snake-draft grouping that respects computed group capacities.
 * Players are sorted by rating (desc) and distributed in a snake pattern.
 */
export function snakeDraftGroups(
  playerIds: number[],
  desiredGroupSize: number,
  memberLookup: (id: number) => Member | undefined,
): number[][] {
  const sortedPlayers = [...playerIds]
    .map(id => ({ id, rating: memberLookup(id)?.rating ?? 0 }))
    .sort((a, b) => b.rating - a.rating)
    .map(p => p.id);

  const capacities = computeGroupCapacities(sortedPlayers.length, desiredGroupSize);
  const numGroups = capacities.length;
  const groups: number[][] = Array(numGroups).fill(null).map(() => []);

  let playerIndex = 0;
  let round = 0;

  while (playerIndex < sortedPlayers.length) {
    const isForward = round % 2 === 0;
    if (isForward) {
      for (let gi = 0; gi < numGroups && playerIndex < sortedPlayers.length; gi++) {
        if (groups[gi].length < capacities[gi]) {
          groups[gi].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      }
    } else {
      for (let gi = numGroups - 1; gi >= 0 && playerIndex < sortedPlayers.length; gi--) {
        if (groups[gi].length < capacities[gi]) {
          groups[gi].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      }
    }
    round++;
  }

  return groups;
}

/**
 * Rank-based (sequential) grouping that respects computed group capacities.
 * Highest rated fill Group 1, next fill Group 2, etc.
 */
export function rankBasedGroups(
  playerIds: number[],
  desiredGroupSize: number,
  memberLookup: (id: number) => Member | undefined,
): number[][] {
  const sorted = [...playerIds]
    .map(id => ({ id, rating: memberLookup(id)?.rating ?? 0 }))
    .sort((a, b) => b.rating - a.rating)
    .map(p => p.id);

  const capacities = computeGroupCapacities(sorted.length, desiredGroupSize);
  const numGroups = capacities.length;
  const groups: number[][] = Array(numGroups).fill(null).map(() => []);

  let playerIndex = 0;
  for (let gi = 0; gi < numGroups; gi++) {
    for (let j = 0; j < capacities[gi] && playerIndex < sorted.length; j++) {
      groups[gi].push(sorted[playerIndex]);
      playerIndex++;
    }
  }

  return groups;
}

// Player statistics for round-robin standings
export interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
}

// Calculate player statistics from tournament matches
export function calculatePlayerStats(tournament: Tournament): Map<number, PlayerStats> {
  const statsMap = new Map<number, PlayerStats>();
  
  // Initialize stats for all participants
  tournament.participants.forEach(p => {
    statsMap.set(p.memberId, {
      memberId: p.memberId,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
    });
  });

  // Calculate stats from matches
  tournament.matches.forEach(match => {
    const stats1 = statsMap.get(match.member1Id);
    const stats2 = match.member2Id ? statsMap.get(match.member2Id) : null;

    if (stats1 && stats2 && match.member2Id !== null) {
      // Handle forfeit matches
      if (match.player1Forfeit) {
        stats1.losses++;
        stats2.wins++;
        stats1.setsLost += 1;
        stats2.setsWon += 1;
      } else if (match.player2Forfeit) {
        stats1.wins++;
        stats2.losses++;
        stats1.setsWon += 1;
        stats2.setsLost += 1;
      } else {
        // Regular match - count sets
        stats1.setsWon += match.player1Sets;
        stats1.setsLost += match.player2Sets;
        stats2.setsWon += match.player2Sets;
        stats2.setsLost += match.player1Sets;

        // Determine winner
        if (match.player1Sets > match.player2Sets) {
          stats1.wins++;
          stats2.losses++;
        } else if (match.player2Sets > match.player1Sets) {
          stats2.wins++;
          stats1.losses++;
        }
      }
    }
  });

  return statsMap;
}

// Calculate sorted standings for round-robin tournament
export function calculateStandings(tournament: Tournament): Array<{ member: Member; stats: PlayerStats; position: number }> {
  const statsMap = calculatePlayerStats(tournament);
  const participants = tournament.participants;
  
  // Create array with player and stats
  const standings = participants.map(participant => ({
    member: participant.member,
    stats: statsMap.get(participant.memberId)!,
  }));

  // Sort according to criteria:
  // 1. Number of wins (descending)
  // 2. Sets won - sets lost (descending)
  // 3. User ID (ascending - lower ID wins tie)
  standings.sort((a, b) => {
    // Primary: wins (higher wins = better)
    if (b.stats.wins !== a.stats.wins) {
      return b.stats.wins - a.stats.wins;
    }

    // Tiebreaker 1: sets won - sets lost (higher difference = better)
    const diffA = a.stats.setsWon - a.stats.setsLost;
    const diffB = b.stats.setsWon - b.stats.setsLost;
    if (diffB !== diffA) {
      return diffB - diffA;
    }

    // Final tiebreaker: user ID (lower ID = better)
    return a.member.id - b.member.id;
  });

  // Add positions (1-based)
  return standings.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

// Build results matrix for round-robin display
export function buildResultsMatrix(tournament: Tournament) {
  const participants = tournament.participants;
  const participantData = tournament.participants;
  
  // Create matrix: matrix[i][j] = match result where participant i played against participant j
  const matrix: (Match | null)[][] = [];
  for (let i = 0; i < participants.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < participants.length; j++) {
      matrix[i][j] = null;
    }
  }

  // Fill matrix with match results
  tournament.matches.forEach(match => {
    const idx1 = participants.findIndex(p => p.memberId === match.member1Id);
    const idx2 = match.member2Id ? participants.findIndex(p => p.memberId === match.member2Id) : -1;
    
    if (idx1 !== -1 && idx2 !== -1) {
      matrix[idx1][idx2] = match;
      // Also store reverse (for symmetry in display)
      matrix[idx2][idx1] = match;
    }
  });

  return { participants, participantData, matrix };
}

// Schedule match interface
export interface ScheduleMatch {
  matchNumber: number;
  round: number;
  member1Id: number;
  member1Name: string;
  member1StoredRating: number | null | undefined;
  member1CurrentRating: number | null | undefined;
  member2Id: number;
  member2Name: string;
  member2StoredRating: number | null | undefined;
  member2CurrentRating: number | null | undefined;
}

export interface ScheduleRound {
  round: number;
  matches: ScheduleMatch[];
}

// Generate schedule for Round Robin tournament using round-robin algorithm
export function generateRoundRobinSchedule(tournament: Tournament): ScheduleRound[] {
  const participants = tournament.participants;
  const n = participants.length;
  
  if (n < 2) return [];

  // Round-robin algorithm: if odd number, add dummy
  const players = [...participants];
  const isDummy = n % 2 === 1;
  if (isDummy) {
    players.push({
      id: -1,
      memberId: -1,
      member: { id: -1, firstName: 'BYE', lastName: '', birthDate: null, isActive: false, rating: null },
      playerRatingAtTime: null,
    });
  }

  const totalPlayers = players.length;
  const rounds: ScheduleRound[] = [];
  let matchNumber = 1;

  // Generate rounds (n-1 rounds for n players, or n rounds for n+1 with dummy)
  for (let round = 0; round < totalPlayers - 1; round++) {
    const roundMatches: ScheduleMatch[] = [];
    
    // Generate matches for this round
    for (let i = 0; i < totalPlayers / 2; i++) {
      const home = (round + i) % (totalPlayers - 1);
      const away = (totalPlayers - 1 - i + round) % (totalPlayers - 1);
      
      // Last player stays in place
      const homeIdx = home === 0 ? totalPlayers - 1 : home - 1;
      const awayIdx = away === 0 ? totalPlayers - 1 : away - 1;
      
      const player1 = players[homeIdx];
      const player2 = players[awayIdx];
      
      // Skip matches with dummy player
      if (player1.memberId !== -1 && player2.memberId !== -1) {
        roundMatches.push({
          matchNumber: matchNumber++,
          round: round + 1,
          member1Id: player1.memberId,
          member1Name: `${player1.member.firstName} ${player1.member.lastName}`,
          member1StoredRating: player1.playerRatingAtTime,
          member1CurrentRating: player1.member.rating,
          member2Id: player2.memberId,
          member2Name: `${player2.member.firstName} ${player2.member.lastName}`,
          member2StoredRating: player2.playerRatingAtTime,
          member2CurrentRating: player2.member.rating,
        });
      }
    }
    
    if (roundMatches.length > 0) {
      rounds.push({
        round: round + 1,
        matches: roundMatches,
      });
    }
  }

  return rounds;
}
