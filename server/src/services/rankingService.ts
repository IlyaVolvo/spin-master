import { prisma } from '../index';

/**
 * Recalculates rankings for all players based on tournament results.
 * This is called when a tournament is completed or when match results are corrected.
 */
export async function recalculateRankings(tournamentId: number) {
  // Get all completed tournaments (including the one just completed)
  const completedTournaments = await prisma.tournament.findMany({
    where: { status: 'COMPLETED' },
    include: {
      participants: {
        include: {
            member: true,
        },
      },
      matches: true,
    },
    orderBy: { createdAt: 'asc' }, // Process tournaments chronologically
  });

  // Get all active players
  const allPlayers = await prisma.member.findMany({
    where: { isActive: true },
  });

  // Initialize player stats
  const playerStats = new Map<number, {
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
    matchesPlayed: number;
  }>();

  allPlayers.forEach((player) => {
    playerStats.set(player.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      matchesPlayed: 0,
    });
  });

  // Process all matches from completed tournaments
  for (const tournament of completedTournaments) {
    for (const match of tournament.matches) {
      // Skip BYE matches (memberId === 0 or member2Id === null/0) - BYEs don't affect ratings or rankings
      if (match.member1Id === 0 || match.member2Id === 0 || match.member2Id === null) {
        continue;
      }
      
      const stats1 = playerStats.get(match.member1Id);
      const stats2 = playerStats.get(match.member2Id);

      if (stats1 && stats2) {
        stats1.matchesPlayed++;
        stats2.matchesPlayed++;
        
        // Handle forfeit matches
        if (match.player1Forfeit) {
          // Player 1 forfeited, Player 2 wins
          stats1.losses++;
          stats2.wins++;
          stats1.setsLost += 1;
          stats2.setsWon += 1;
        } else if (match.player2Forfeit) {
          // Player 2 forfeited, Player 1 wins
          stats1.wins++;
          stats2.losses++;
          stats1.setsWon += 1;
          stats2.setsLost += 1;
        } else {
          // Regular match
          stats1.setsWon += match.player1Sets;
          stats1.setsLost += match.player2Sets;
          stats2.setsWon += match.player2Sets;
          stats2.setsLost += match.player1Sets;

          if (match.player1Sets > match.player2Sets) {
            stats1.wins++;
            stats2.losses++;
          } else if (match.player2Sets > match.player1Sets) {
            stats2.wins++;
            stats1.losses++;
          }
        }
      }
    }
  }

  // Calculate win rate and set ratio for ranking
  const playerRankings = Array.from(playerStats.entries())
    .map(([memberId, stats]) => {
      const winRate = stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0;
      const setRatio = stats.setsLost > 0 ? stats.setsWon / stats.setsLost : (stats.setsWon > 0 ? 999 : 0);
      const score = winRate * 0.7 + Math.min(setRatio / 2, 1) * 0.3; // Weighted score

      return {
        memberId,
        wins: stats.wins,
        losses: stats.losses,
        matchesPlayed: stats.matchesPlayed,
        score,
      };
    })
    .filter(p => p.matchesPlayed > 0) // Only rank players who have played
    .sort((a, b) => {
      // Sort by score descending, then by wins descending
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.wins - a.wins;
    });

  // Update rankings
  const rankingMap = new Map<number, number>();
  playerRankings.forEach((player, index) => {
    rankingMap.set(player.memberId, index + 1);
  });

    // Note: Rankings are calculated from ratings on the frontend
    // No need to store rankings in the database - they are derived from ratings
    // Rating history is created separately when ratings are updated
  }


