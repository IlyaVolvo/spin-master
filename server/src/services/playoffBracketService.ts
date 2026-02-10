/**
 * Service for managing single elimination (playoff) tournament brackets
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface BracketMatch {
  round: number;
  position: number; // Position in the round (1, 2, 3, ...)
  member1Id: number | null;
  member2Id: number | null;
  player1IsBye: boolean;
  player2IsBye: boolean;
  matchId?: number;
  winnerId?: number | null;
  nextMatchId?: number | null; // ID of match in next round
  nextMatchPosition?: number; // Position in next round
}

/**
 * Calculate the number of rounds needed for a bracket
 */
export function calculateRounds(playerCount: number): number {
  const bracketSize = calculateBracketSize(playerCount);
  return Math.log2(bracketSize);
}

/**
 * Calculate the bracket size (next power of 2)
 */
export function calculateBracketSize(playerCount: number): number {
  return Math.pow(2, Math.ceil(Math.log2(playerCount)));
}

/**
 * Generate standard seeding for a bracket
 * Returns array of player IDs in seeded order (seed 1 = highest rating, seed n = lowest rating)
 */
export function generateSeeding(participants: Array<{ memberId: number; playerRatingAtTime: number | null }>): number[] {
  // Sort by rating (highest first), then by memberId for consistency
  const sorted = [...participants].sort((a, b) => {
    const ratingA = a.playerRatingAtTime ?? 0;
    const ratingB = b.playerRatingAtTime ?? 0;
    if (ratingB !== ratingA) {
      return ratingB - ratingA; // Higher rating = higher seed
    }
    return a.memberId - b.memberId; // Tiebreaker: lower ID = higher seed
  });
  
  return sorted.map(p => p.memberId);
}

/**
 * Generate bracket positions using proper tournament seeding rules
 * Returns array of player IDs in bracket order (with null for BYEs)
 * 
 * Algorithm:
 * 1. Determine the right positions for all seeded players
 * 2. Randomly assign a subset of remaining players to positions where no assignment is made yet.
 *    As the result each pair would have exactly one player
 * 3. Calculate number of BYEs that should be in the given bracket. It should be [0, numPlayers/2[
 * 4. Assign BYEs for players with the highest rating already assigned to each match
 * 5. Randomly assign the remaining players to still open positions in match
 * 
 * @param seededPlayers - Array of all player IDs sorted by seed (highest rating first)
 * @param bracketSize - Size of bracket (power of 2)
 * @param numSeeded - Number of seeded positions (default: all players are seeded)
 */
export function generateBracketPositions(seededPlayers: number[], bracketSize: number, numSeeded?: number): Array<number | null> {
  const positions: Array<number | null> = new Array(bracketSize).fill(null);
  const numPlayers = seededPlayers.length;
  
  // Validate numSeeded parameter according to rules:
  // - Can be 0 OR any power of 2 >= 2 (powers of 2 are: 2, 4, 8, 16, ...)
  // - Must be <= largest power of 2 <= floor(numPlayers / 4)
  // - No more than a quarter of total players can be seeded
  // Examples:
  //   - numPlayers = 10: valid numSeeded = 0, 2 (max is 2, since floor(10/4)=2, largest power of 2 <= 2 is 2)
  //   - numPlayers = 16: valid numSeeded = 0, 2, 4 (max is 4, since floor(16/4)=4, largest power of 2 <= 4 is 4)
  //   - numPlayers = 5: valid numSeeded = 0 (floor(5/4)=1, no power of 2 >= 2 fits)
  //   - numPlayers = 8: valid numSeeded = 0, 2 (max is 2, since floor(8/4)=2, largest power of 2 <= 2 is 2)
  //   - numPlayers = 32: valid numSeeded = 0, 2, 4, 8 (max is 8, since floor(32/4)=8)
  let numSeededToUse: number;
  
  // Calculate maximum allowed numSeeded = largest power of 2 <= floor(numPlayers / 4)
  const quarterNumPlayers = Math.floor(numPlayers / 4);
  const maxSeeded = quarterNumPlayers >= 2 
    ? Math.pow(2, Math.floor(Math.log2(quarterNumPlayers)))
    : 0;
  
  if (numSeeded === undefined) {
    // Default: use the maximum allowed numSeeded (or 0 if not possible)
    numSeededToUse = maxSeeded > 0 ? maxSeeded : 0;
  } else {
    if (numSeeded < 0) {
      throw new Error(`numSeeded must be non-negative, got ${numSeeded}`);
    }
    
    numSeededToUse = Math.min(numSeeded, numPlayers);
    
    if (numSeededToUse > 0) {
      // Check if it's a power of 2 >= 2 (exclude 1)
      const isPowerOf2 = (numSeededToUse & (numSeededToUse - 1)) === 0 && numSeededToUse > 0;
      if (!isPowerOf2) {
        throw new Error(`numSeeded must be 0 or a power of 2 (2, 4, 8, 16, ...), got ${numSeededToUse}`);
      }
      
      // Reject 1 as a valid value
      if (numSeededToUse === 1) {
        throw new Error(`numSeeded cannot be 1, must be 0 or a power of 2 >= 2 (2, 4, 8, 16, ...)`);
      }
      
      if (numSeededToUse > maxSeeded) {
        throw new Error(`numSeeded (${numSeededToUse}) must be <= ${maxSeeded} (largest power of 2 <= floor(${numPlayers}/4))`);
      }
    }
  }
  
  // Split into seeded and remaining players
  const seededPlayerIds = numSeededToUse > 0 ? seededPlayers.slice(0, numSeededToUse) : [];
  const remainingPlayerIds = seededPlayers.slice(numSeededToUse);
  
  // Helper: Shuffle array
  const shuffle = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  
  // STEP 1: Determine the right positions for all seeded players
  if (seededPlayerIds.length > 0) {
    const bracketPattern = generateTournamentBracketPattern(bracketSize);
    // bracketPattern[seedIndex] = position (0-indexed), where seedIndex 0 = seed 1
    // Place seeded players according to the bracket pattern
    for (let i = 0; i < seededPlayerIds.length && i < bracketSize; i++) {
      const position = bracketPattern[i];
      positions[position] = seededPlayerIds[i];
    }
  }
  
  // STEP 2: Randomly assign from pool of remaining players to each match in a bracket 
  // that has no players yet assigned. After completing this step each match must have exactly one player assigned.
  // At the start point (after Step 1), no match can have 2 players assigned. Each match can have:
  // - 0 players (both positions null): assign one player to this match
  // - 1 player (one position has a player, other is null): skip this match (already has one player)
  const shuffledRemaining = shuffle(remainingPlayerIds);
  const numMatches = bracketSize / 2;
  let remainingIndex = 0;
  
  // Assign remaining players to matches that have NO players yet (both positions null)
  // After this step, EACH match will have exactly one player assigned
  for (let matchIndex = 0; matchIndex < numMatches; matchIndex++) {
    const pos1 = matchIndex * 2;
    const pos2 = pos1 + 1;
    const player1 = positions[pos1];
    const player2 = positions[pos2];
    
    // Assert that we're not in an invalid state (both positions assigned)
    if (player1 !== null && player2 !== null) {
      throw new Error(`Invalid state: Match ${matchIndex} has two players assigned (positions ${pos1} and ${pos2}). This should not happen after Step 1.`);
    }
    
    // If match has no players (both positions null), assign one player to it
    if (player1 === null && player2 === null) {
      // Assert that we have enough remaining players to fill all empty matches
      if (remainingIndex >= shuffledRemaining.length) {
        throw new Error(`Not enough remaining players to fill empty matches. Expected at least ${remainingIndex + 1} players, but only have ${shuffledRemaining.length}`);
      }
      
      // Randomly assign to either position 1 or 2
      const usePos1 = Math.random() < 0.5;
      positions[usePos1 ? pos1 : pos2] = shuffledRemaining[remainingIndex];
      remainingIndex++;
    }
    // Note: After Step 1, no match should have 2 players, so we don't handle that case here
  }
  
  // Assertion after Step 2: Every match must have exactly one player assigned
  // After Step 2, we should have assigned: seeded players + remaining players from Step 2 = numMatches players total
  // Formula: shuffledRemaining.length - remainingIndex == numPlayers - numMatches
  // This verifies that we've assigned exactly numMatches players (one per match)
  if (shuffledRemaining.length - remainingIndex !== numPlayers - numMatches) {
    throw new Error(`Assertion failed after Step 2: Expected exactly ${numMatches} players assigned (one per match), but the count doesn't match. shuffledRemaining.length - remainingIndex = ${shuffledRemaining.length - remainingIndex}, numPlayers - numMatches = ${numPlayers - numMatches}`);
  }
  
  // STEP 3: Calculate number of BYEs in the bracket.
  // BYEs = bracketSize - numPlayers (empty positions that become BYEs)
  // Each BYE match has one player and one empty slot (null).
  const numByes = bracketSize - numPlayers;
  
  // STEP 4: Assign BYEs for players with the highest rating already assigned to each match
  // For each match, if it has exactly one player, check if that player is among the top numByes players
  // If so, ensure the other position is null (BYE)
  // Note: topPlayersForByes includes BOTH seeded and unseeded players, sorted by rating (highest first)
  // If numByes > numSeededToUse, then unseeded players will also receive BYEs
  const playersByRating = [...seededPlayers]; // Already sorted by rating (highest first) - includes ALL players
  const topPlayersForByes = playersByRating.slice(0, numByes); // Top numByes players by rating (seeded + unseeded)
  
  for (let matchIndex = 0; matchIndex < numMatches; matchIndex++) {
    const pos1 = matchIndex * 2;
    const pos2 = matchIndex * 2 + 1;
    const player1 = positions[pos1];
    const player2 = positions[pos2];
    
    // If match has exactly one player and that player should get a BYE
    if (player1 !== null && player2 === null) {
      if (topPlayersForByes.includes(player1)) {
        // Player already has BYE (position 2 is null)
        continue;
      }
    } else if (player1 === null && player2 !== null) {
      if (topPlayersForByes.includes(player2)) {
        // Player already has BYE (position 1 is null)
        continue;
      }
    } else if (player1 !== null && player2 !== null) {
      // Match has two players - check if we should give one a BYE
      const player1Index = topPlayersForByes.indexOf(player1);
      const player2Index = topPlayersForByes.indexOf(player2);
      
      if (player1Index !== -1 && player1Index < player2Index) {
        // Player1 should get BYE - move player2 elsewhere
        // For now, we'll handle this in step 5
      } else if (player2Index !== -1 && player2Index < player1Index) {
        // Player2 should get BYE - move player1 elsewhere
        // For now, we'll handle this in step 5
      }
    }
  }
  
  // Ensure top players get BYEs by making their paired position null
  for (let i = 0; i < topPlayersForByes.length; i++) {
    const topPlayer = topPlayersForByes[i];
    const playerPosition = positions.indexOf(topPlayer);
    
    if (playerPosition !== -1) {
      const isEven = playerPosition % 2 === 0;
      const pairedPosition = isEven ? playerPosition + 1 : playerPosition - 1;
      
      // If paired position has a player, we need to move them (will be handled in step 5)
      // For now, just mark the paired position as needing to be cleared
      if (positions[pairedPosition] !== null && pairedPosition < bracketSize) {
        // We'll handle this by ensuring the other player gets moved in step 5
        // The BYE assignment will happen naturally when we place remaining players
      }
    }
  }
  
  // STEP 5: Randomly assign the remaining players to still open positions in match
  // Get list of still unassigned players
  const unassignedPlayers: number[] = [];
  for (const memberId of shuffledRemaining.slice(remainingIndex)) {
    if (!positions.includes(memberId)) {
      unassignedPlayers.push(memberId);
    }
  }
  
  // Shuffle unassigned players
  const shuffledUnassigned = shuffle(unassignedPlayers);
  let unassignedIndex = 0;
  
  // Find all matches that have only one player and can accept another player
  // (i.e., matches where the other position is null and the player doesn't need a BYE)
  for (let matchIndex = 0; matchIndex < numMatches && unassignedIndex < shuffledUnassigned.length; matchIndex++) {
    const pos1 = matchIndex * 2;
    const pos2 = pos1 + 1;
    const player1 = positions[pos1];
    const player2 = positions[pos2];
    
    // Find matches with exactly one player where that player doesn't need a BYE
    if (player1 !== null && player2 === null) {
      // Player1 is assigned, position 2 is empty
      // Check if player1 needs a BYE
      if (!topPlayersForByes.includes(player1)) {
        // Player1 doesn't need BYE, so we can assign player2
        positions[pos2] = shuffledUnassigned[unassignedIndex];
        unassignedIndex++;
      }
      // If player1 needs BYE, leave position 2 as null (BYE)
    } else if (player1 === null && player2 !== null) {
      // Player2 is assigned, position 1 is empty
      // This should never happen after normalization, but if it does, we need to swap
      // BYEs must always be in position 2, so swap player2 to position 1 and make position 2 BYE
      if (topPlayersForByes.includes(player2)) {
        // Player2 needs BYE - swap so BYE is in position 2
        positions[pos1] = player2;
        positions[pos2] = null; // BYE in position 2
      } else {
        // Player2 doesn't need BYE, so we can assign player1
        positions[pos1] = shuffledUnassigned[unassignedIndex];
        unassignedIndex++;
      }
    }
  }
  
  // Any remaining unassigned players should be placed in matches that still have empty positions
  // and where placing them won't violate BYE rules or create double BYEs
  for (let matchIndex = 0; matchIndex < numMatches && unassignedIndex < shuffledUnassigned.length; matchIndex++) {
    const pos1 = matchIndex * 2;
    const pos2 = matchIndex * 2 + 1;
    const player1 = positions[pos1];
    const player2 = positions[pos2];
    
    // Find matches with one player where we can add another
    // IMPORTANT: Do NOT assign if the existing player needs a BYE (they're in topPlayersForByes)
    if (player1 !== null && player2 === null) {
      // Position 2 is empty - check if we can assign here
      // Only assign if player1 does NOT need a BYE
      if (!topPlayersForByes.includes(player1) && unassignedIndex < shuffledUnassigned.length) {
        positions[pos2] = shuffledUnassigned[unassignedIndex];
        unassignedIndex++;
      }
      // If player1 needs BYE, leave position 2 as null (BYE) - do NOT assign another player
    } else if (player1 === null && player2 !== null) {
      // Position 1 is empty, position 2 has a player
      // This should not happen - BYEs must be in position 2
      // Check if player2 needs a BYE
      if (topPlayersForByes.includes(player2)) {
        // Player2 needs BYE - swap so BYE is in position 2
        positions[pos1] = player2;
        positions[pos2] = null; // BYE in position 2
      } else if (unassignedIndex < shuffledUnassigned.length) {
        // Player2 doesn't need BYE - assign unassigned player to position 1
        positions[pos1] = shuffledUnassigned[unassignedIndex];
        unassignedIndex++;
      } else {
        // No unassigned players left, but position 1 is empty - this shouldn't happen
        // Swap to ensure BYE is in position 2 (even though player2 doesn't need BYE)
        positions[pos1] = player2;
        positions[pos2] = null; // BYE in position 2
      }
    } else if (player1 === null && player2 === null) {
      // Both positions empty - should not happen after Step 2, but if it does, assign one player
      if (unassignedIndex < shuffledUnassigned.length) {
        positions[pos1] = shuffledUnassigned[unassignedIndex];
        unassignedIndex++;
      }
    }
  }
  
  // Now ensure BYEs are correctly assigned to top players
  // For each top player who should have a BYE, ensure their paired position is null
  for (const topPlayer of topPlayersForByes) {
    const playerPosition = positions.indexOf(topPlayer);
    if (playerPosition !== -1) {
      const isEven = playerPosition % 2 === 0;
      const pairedPosition = isEven ? playerPosition + 1 : playerPosition - 1;
      
      if (pairedPosition >= 0 && pairedPosition < bracketSize) {
        const pairedPlayer = positions[pairedPosition];
        if (pairedPlayer !== null) {
          // Top player is paired with another player - need to move that player
          // Find an open position or swap with a lower-rated player
          let moved = false;
          
          // First try to find an open position in a match that needs a second player
          for (let matchIndex = 0; matchIndex < numMatches; matchIndex++) {
            const pos1 = matchIndex * 2;
            const pos2 = matchIndex * 2 + 1;
            
            if (pos1 === playerPosition || pos1 === pairedPosition ||
                pos2 === playerPosition || pos2 === pairedPosition) {
              continue; // Skip the match containing our top player
            }
            
            const player1 = positions[pos1];
            const player2 = positions[pos2];
            
            // Find matches with exactly one player where that player doesn't need a BYE
            if (player1 !== null && player2 === null) {
              if (!topPlayersForByes.includes(player1)) {
                // Move pairedPlayer here
                positions[pos2] = pairedPlayer;
                positions[pairedPosition] = null; // Give top player BYE
                moved = true;
                break;
              }
            } else if (player1 === null && player2 !== null) {
              // Position 1 is empty, position 2 has a player
              // This should not happen - BYEs must be in position 2
              // Swap first, then assign
              positions[pos1] = player2;
              positions[pos2] = null; // BYE in position 2
              if (!topPlayersForByes.includes(player2)) {
                // Move pairedPlayer to position 1
                positions[pos1] = pairedPlayer;
                positions[pos2] = player2; // Restore player2 to position 2
                positions[pairedPosition] = null; // Give top player BYE
                moved = true;
                break;
              } else {
                // Player2 needs BYE, so keep the swap and give top player BYE
                positions[pairedPosition] = null; // Give top player BYE
                moved = true;
                break;
              }
            }
          }
          
          // If still not moved, swap with a lower-rated player who has a BYE
          if (!moved) {
            for (let matchIndex = 0; matchIndex < numMatches; matchIndex++) {
              const pos1 = matchIndex * 2;
              const pos2 = matchIndex * 2 + 1;
              
              if (pos1 === playerPosition || pos1 === pairedPosition ||
                  pos2 === playerPosition || pos2 === pairedPosition) {
                continue;
              }
              
              const player1 = positions[pos1];
              const player2 = positions[pos2];
              const hasBye1 = player1 === null;
              const hasBye2 = player2 === null;
              
              if (hasBye1 && player2 !== null) {
                // BYE in position 1 is invalid - swap first
                positions[pos1] = player2;
                positions[pos2] = null; // BYE in position 2
                const player2Index = seededPlayers.indexOf(player2);
                const topPlayerIndex = seededPlayers.indexOf(topPlayer);
                if (player2Index > topPlayerIndex) {
                  // Swap: top player gets BYE, lower player takes original position
                  positions[pairedPosition] = player2;
                  positions[pos1] = topPlayer;
                  positions[playerPosition] = null; // Top player now has BYE in position 2
                  moved = true;
                  break;
                }
              } else if (hasBye2 && player1 !== null) {
                // BYE in position 2 is correct
                const player1Index = seededPlayers.indexOf(player1);
                const topPlayerIndex = seededPlayers.indexOf(topPlayer);
                if (player1Index > topPlayerIndex) {
                  // Swap: top player gets BYE, lower player takes original position
                  positions[pairedPosition] = player1;
                  positions[pos1] = topPlayer;
                  positions[playerPosition] = null; // Top player now has BYE in position 2
                  moved = true;
                  break;
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Final validation: Ensure no double BYEs exist
  for (let i = 0; i < bracketSize; i += 2) {
    const pos1 = i;
    const pos2 = i + 1;
    if (positions[pos1] === null && positions[pos2] === null) {
      // Both are BYEs - this is invalid! Find any player to place here
      for (let j = 0; j < numPlayers; j++) {
        const memberId = seededPlayers[j];
        if (!positions.includes(memberId)) {
          positions[pos1] = memberId;
          break;
        }
      }
      // If all players are placed, find any player and move them
      if (positions[pos1] === null && seededPlayers.length > 0) {
        for (let j = numPlayers - 1; j >= 0; j--) {
          const memberId = seededPlayers[j];
          const playerPos = positions.indexOf(memberId);
          if (playerPos !== -1 && playerPos !== pos1 && playerPos !== pos2) {
            positions[playerPos] = null;
            positions[pos1] = memberId;
            break;
          }
        }
      }
    }
  }
  
  // Normalize: Ensure BYEs are always in the second position (player2) in each match pair
  for (let i = 0; i < bracketSize; i += 2) {
    const pos1 = i;
    const pos2 = i + 1;
    const player1 = positions[pos1];
    const player2 = positions[pos2];
    
    // If position 1 is null (BYE) and position 2 has a player, swap them
    // This ensures BYE is always in position 2
    if (player1 === null && player2 !== null) {
      positions[pos1] = player2;
      positions[pos2] = null; // BYE in position 2
    }
    // If position 1 has a player and position 2 is null, that's correct (BYE in position 2)
    // If both have players, no change needed
    // If both are null, that's an error but should be handled by validation above
  }
  
  return positions;
}

/**
 * Generate standard tournament bracket seeding pattern (USTA/ITF style).
 * Returns array of bracket positions (0-indexed) for seeds 1, 2, 3, ...
 * 
 * Properties:
 * - Seed 1 at the very top (position 0), Seed 2 at the very bottom (position bracketSize-1)
 * - Seed 3 at top of bottom half, Seed 4 at bottom of top half
 * - In each first-round match, seeds sum to bracketSize + 1
 * - Higher seeds are maximally separated from each other
 * - Works for any power of 2 (2, 4, 8, 16, 32, 64, 128, 256, ...)
 * 
 * Examples (position → seed):
 *   Size 2:  [1, 2]
 *   Size 4:  [1, 4, 3, 2]
 *   Size 8:  [1, 8, 4, 5, 3, 6, 7, 2]
 *   Size 16: [1, 16, 8, 9, 4, 13, 5, 12, 3, 14, 6, 11, 7, 10, 15, 2]
 * 
 * @param bracketSize - Must be a power of 2 (2, 4, 8, 16, 32, 64, 128, 256, ...)
 * @returns Array of bracket positions (0-indexed) where index represents seed-1
 */
function generateTournamentBracketPattern(bracketSize: number): number[] {
  // Validate bracket size is a power of 2
  if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new Error(`Bracket size must be a power of 2, got: ${bracketSize}`);
  }
  
  const positionToSeed = placeSeedsInBracket(bracketSize);
  
  // Convert position→seed to seed→position (result[seedIndex] = position)
  // seedIndex is 0-based (seedIndex 0 = seed 1)
  const result: number[] = new Array(bracketSize);
  for (let pos = 0; pos < bracketSize; pos++) {
    const seed = positionToSeed[pos]; // 1-based seed at this position
    result[seed - 1] = pos; // seedIndex = seed - 1
  }
  
  return result;
}

/**
 * Build position→seed mapping for a bracket using iterative expansion.
 * 
 * Start with [1, 2] and iteratively double the bracket size.
 * At each expansion, every existing seed gets a complement opponent (sum = newSize + 1).
 * All seeds expand normally (seed on top, complement below) EXCEPT the very last
 * position (seed 2's lineage) which expands reversed (complement on top, seed below).
 * This keeps seed 2 anchored at the very bottom of the bracket at every level.
 * 
 * @param bracketSize - Must be a power of 2
 * @returns Array of 1-based seed numbers in bracket position order
 */
function placeSeedsInBracket(bracketSize: number): number[] {
  let seeds = [1, 2];
  
  while (seeds.length < bracketSize) {
    const nextSize = seeds.length * 2;
    const sum = nextSize + 1;
    const expanded: number[] = [];
    const lastIndex = seeds.length - 1;
    
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const complement = sum - seed;
      
      if (i === lastIndex) {
        // Last position (seed 2's lineage): complement on top, seed stays at bottom
        expanded.push(complement, seed);
      } else {
        // All other positions: seed on top, complement below
        expanded.push(seed, complement);
      }
    }
    
    seeds = expanded;
  }
  
  return seeds;
}

/**
 * Create initial bracket matches for a playoff tournament with provided positions
 */
export async function createPlayoffBracketWithPositions(
  tournamentId: number,
  participantIds: number[],
  providedPositions?: Array<number | null>
): Promise<{ matches: BracketMatch[]; byes: number[] }> {
  const bracketSize = calculateBracketSize(participantIds.length);
  const numRounds = calculateRounds(bracketSize);
  
  // Get participants with ratings
  const participants = await prisma.tournamentParticipant.findMany({
    where: {
      tournamentId,
      memberId: { in: participantIds },
    },
  });
  
  let bracketPositions: Array<number | null>;
  
  if (providedPositions && providedPositions.length === bracketSize) {
    // Use provided positions
    bracketPositions = [...providedPositions]; // Create a copy to avoid mutating the original
  } else {
    // Generate seeding and bracket positions automatically
    const seededPlayers = generateSeeding(participants);
    bracketPositions = generateBracketPositions(seededPlayers, bracketSize);
  }
  
  // Normalize: Ensure BYEs are always in the second position (player2) in each match pair
  // This applies to both provided and generated positions
  for (let i = 0; i < bracketSize; i += 2) {
    const pos1 = i;
    const pos2 = i + 1;
    const player1 = bracketPositions[pos1];
    const player2 = bracketPositions[pos2];
    
    // If position 1 is null (BYE) and position 2 has a player, swap them
    // This ensures BYE is always in position 2
    if (player1 === null && player2 !== null) {
      bracketPositions[pos1] = player2;
      bracketPositions[pos2] = null; // BYE in position 2
    }
  }
  
  // Identify BYEs (null positions)
  const byes: number[] = [];
  const firstRoundMatches: Array<{
    tournamentId: number;
    member1Id: number | null;
    member2Id: number | null;
    round: number;
    position: number;
    nextMatchPosition: number;
  }> = [];
  
  // Create first round matches
  // Ensure BYEs are normalized to be in position 2 before creating matches
  for (let i = 0; i < bracketSize; i += 2) {
    let member1Id = bracketPositions[i];
    let member2Id = bracketPositions[i + 1];
    
    // Normalize: If BYE is in position 1, swap so BYE is always in position 2
    if (member1Id === null && member2Id !== null) {
      // Swap: move player to position 1, BYE to position 2
      member1Id = member2Id;
      member2Id = null;
    }
    
    const matchPosition = (i / 2) + 1;
    const nextRoundPosition = Math.floor((matchPosition - 1) / 2) + 1;
    
    // Create ALL matches including BYE matches
    // BYE matches have member2Id === null
    if (member1Id !== null) {
      // Track BYEs for automatic advancement
      if (member2Id === null) {
        byes.push(member1Id);
      }
      
      // Create match record for both regular and BYE matches
      // Use 0 for BYE instead of null
      firstRoundMatches.push({
        tournamentId,
        member1Id,
        member2Id: member2Id, // Use null for BYE matches
        round: 1,
        position: matchPosition,
        nextMatchPosition: nextRoundPosition,
      });
    }
    // If both are null, that's an error (shouldn't happen after normalization)
  }
  
  // Create bracket matches in database (BracketMatch table - structure only, no results yet)
  const bracketMatchMap = new Map<string, number>(); // key: "round-position" -> bracketMatchId
  
  // First, create all bracket matches for all rounds
  for (let round = 1; round <= numRounds; round++) {
    const numMatchesInRound = bracketSize / Math.pow(2, round);
    for (let position = 1; position <= numMatchesInRound; position++) {
      const key = `${round}-${position}`;
      
      // For round 1, use player IDs from bracketPositions
      let member1Id: number | null = null;
      let member2Id: number | null = null;
      
      if (round === 1) {
        const matchData = firstRoundMatches.find(m => m.position === position);
        if (matchData) {
          member1Id = matchData.member1Id;
          // Use null for BYE matches
          member2Id = matchData.member2Id;
        }
      }
      // For later rounds, player IDs will be filled when previous rounds complete
      
      const bracketMatch = await prisma.bracketMatch.create({
        data: {
          tournamentId,
          round,
          position,
          member1Id,
          member2Id,
        },
      });
      
      bracketMatchMap.set(key, bracketMatch.id);
    }
  }
  
  // Now set nextMatchId for all bracket matches
  for (let round = 1; round < numRounds; round++) {
    const numMatchesInRound = bracketSize / Math.pow(2, round);
    for (let position = 1; position <= numMatchesInRound; position++) {
      const currentKey = `${round}-${position}`;
      const currentBracketMatchId = bracketMatchMap.get(currentKey);
      const nextRound = round + 1;
      const nextPosition = Math.floor((position - 1) / 2) + 1;
      const nextKey = `${nextRound}-${nextPosition}`;
      const nextBracketMatchId = bracketMatchMap.get(nextKey);
      
      if (currentBracketMatchId && nextBracketMatchId) {
        await prisma.bracketMatch.update({
          where: { id: currentBracketMatchId },
          data: { nextMatchId: nextBracketMatchId },
        });
      }
    }
  }
  
  // Convert to BracketMatch format for return
  const createdMatches: BracketMatch[] = [];
  for (const matchData of firstRoundMatches) {
    const key = `${matchData.round}-${matchData.position}`;
    const bracketMatchId = bracketMatchMap.get(key);
    const nextKey = matchData.nextMatchPosition > 0 ? `${matchData.round + 1}-${matchData.nextMatchPosition}` : null;
    const nextMatchId = nextKey ? bracketMatchMap.get(nextKey) : undefined;
    const isByeMatch = matchData.member2Id === null;
    
    if (bracketMatchId) {
      createdMatches.push({
        round: matchData.round,
        position: matchData.position,
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id, // null for BYE matches
        player1IsBye: false,
        player2IsBye: isByeMatch,
        matchId: bracketMatchId, // Store bracketMatchId here
        winnerId: isByeMatch ? matchData.member1Id : null,
        nextMatchPosition: matchData.nextMatchPosition,
        nextMatchId: nextMatchId || undefined,
      });
    }
  }
  
  // Automatically promote BYE players to next round
  // For BYEs, don't create Match records - directly update the next round's BracketMatch
  if (byes.length > 0) {
    for (let i = 0; i < bracketPositions.length; i += 2) {
      const member1Id = bracketPositions[i];
      const member2Id = bracketPositions[i + 1];
      const hasBye = member2Id === null && member1Id !== null;
      
      if (hasBye && member1Id) {
        const matchPosition = (i / 2) + 1;
        const key = `1-${matchPosition}`;
        const bracketMatchId = bracketMatchMap.get(key);
        
        if (bracketMatchId) {
          // Get the bracket match to find nextMatchId
          const bracketMatch = await (prisma as any).bracketMatch.findUnique({
            where: { id: bracketMatchId },
            include: { nextMatch: true },
          });
          
          if (bracketMatch && bracketMatch.nextMatch) {
            // Determine if winner goes to player1 or player2 slot in next match
            // Odd positions (1, 3, 5...) go to player1 slot, even positions (2, 4, 6...) go to player2 slot
            const isPlayer1Slot = (matchPosition - 1) % 2 === 0;
            
            // Directly update the next round's BracketMatch - no Match record needed for BYEs
            if (isPlayer1Slot) {
              await (prisma as any).bracketMatch.update({
                where: { id: bracketMatch.nextMatch.id },
                data: { member1Id: member1Id },
              });
            } else {
              await (prisma as any).bracketMatch.update({
                where: { id: bracketMatch.nextMatch.id },
                data: { member2Id: member1Id },
              });
            }
          }
        }
      }
    }
  }
  
  return { matches: createdMatches, byes };
}

/**
 * Create initial bracket matches for a playoff tournament (legacy function for backward compatibility)
 */
export async function createPlayoffBracket(
  tournamentId: number,
  participantIds: number[]
): Promise<{ matches: BracketMatch[]; byes: number[] }> {
  return createPlayoffBracketWithPositions(tournamentId, participantIds);
}

/**
 * Advance winner to next round and update next bracket match
 * Now works with bracketMatchId instead of matchId
 */
export async function advanceWinner(
  tournamentId: number,
  bracketMatchId: number,
  winnerId: number
): Promise<{ nextMatchCreated: boolean; tournamentCompleted: boolean }> {
  // Get the bracket match
  const bracketMatch = await prisma.bracketMatch.findUnique({
    where: { id: bracketMatchId },
    include: { 
      tournament: {
        include: { participants: true },
      },
      nextMatch: true,
    },
  });
  
  if (!bracketMatch || bracketMatch.tournamentId !== tournamentId) {
    throw new Error('Bracket match not found');
  }
  
  const tournament = bracketMatch.tournament;
  if (tournament.type !== 'PLAYOFF') {
    throw new Error('Tournament is not a playoff tournament');
  }
  
  const currentRound = bracketMatch.round;
  const currentPosition = bracketMatch.position;
  
  // Check if this is the final
  const bracketSize = calculateBracketSize(tournament.participants.length);
  const totalRounds = calculateRounds(bracketSize);
  const isFinal = currentRound >= totalRounds;
  
  if (isFinal) {
    // Tournament is complete
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED', recordedAt: new Date() },
    });
    return { nextMatchCreated: false, tournamentCompleted: true };
  }
  
  // Get the next bracket match
  const nextBracketMatch = bracketMatch.nextMatch;
  if (!nextBracketMatch) {
    throw new Error('Next bracket match not found');
  }
  
  // Determine if winner goes to player1 or player2 slot in next match
  // Odd positions (1, 3, 5...) go to player1 slot, even positions (2, 4, 6...) go to player2 slot
  const isPlayer1Slot = (currentPosition - 1) % 2 === 0;
  
  // Update the next bracket match with the winner
  if (isPlayer1Slot) {
    await prisma.bracketMatch.update({
      where: { id: nextBracketMatch.id },
      data: { member1Id: winnerId },
    });
  } else {
    await prisma.bracketMatch.update({
      where: { id: nextBracketMatch.id },
      data: { member2Id: winnerId },
    });
  }
  
  return { nextMatchCreated: false, tournamentCompleted: false };
}

/**
 * Get bracket structure for display
 * Now queries from BracketMatch table
 */
export async function getBracketStructure(tournamentId: number): Promise<BracketMatch[]> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: {
        include: {
            member: true,
        },
      },
      bracketMatches: {
        include: {
          match: true, // Include actual match results if played
        },
        orderBy: [
          { round: 'asc' },
          { position: 'asc' },
        ],
      },
    },
  });
  
  if (!tournament || tournament.type !== 'PLAYOFF') {
    throw new Error('Tournament is not a playoff tournament');
  }
  
  const bracket: BracketMatch[] = [];
  
  const tournamentWithBracket = tournament as any;
  
  for (const bracketMatch of tournamentWithBracket.bracketMatches) {
    // Check for BYEs: memberId === null means BYE
    const player1IsBye = bracketMatch.member1Id === null;
    const player2IsBye = bracketMatch.member2Id === null;
    
    // Determine winner from match result if it exists
    let winnerId: number | null = null;
    if (bracketMatch.match) {
      const match = bracketMatch.match;
      if (match.player1Sets > (match.player2Sets ?? 0)) {
        winnerId = match.member1Id;
      } else if ((match.player2Sets ?? 0) > match.player1Sets) {
        winnerId = match.member2Id;
      } else if (match.player1Forfeit) {
        winnerId = match.member2Id;
      } else if (match.player2Forfeit) {
        winnerId = match.member1Id;
      }
    } else {
      // No match result yet - check for BYE and auto-promote
      // BYE players automatically win and advance
      if (player1IsBye && bracketMatch.member2Id !== null) {
        // Player 1 is BYE, Player 2 automatically wins
        winnerId = bracketMatch.member2Id;
      } else if (player2IsBye && bracketMatch.member1Id !== null) {
        // Player 2 is BYE, Player 1 automatically wins
        winnerId = bracketMatch.member1Id;
      }
    }
    
    bracket.push({
      round: bracketMatch.round,
      position: bracketMatch.position,
      member1Id: bracketMatch.member1Id, // null for BYE matches
      member2Id: bracketMatch.member2Id, // null for BYE matches
      player1IsBye,
      player2IsBye,
      matchId: bracketMatch.match?.id || bracketMatch.id, // Use bracketMatchId if no match result yet
      winnerId,
      nextMatchId: bracketMatch.nextMatchId || undefined,
    });
  }
  
  // Ensure BYE winners are automatically marked and displayed in next rounds
  // This ensures proper bracket structure display even if BYEs appear in later rounds
  // Create a lookup map: bracketMatch database ID -> bracket entry
  // We need to match by the original bracketMatch.id from database
  const bracketMap = new Map<number, typeof bracket[0]>();
  for (let i = 0; i < bracket.length; i++) {
    const match = bracket[i];
    // matchId is either Match.id or BracketMatch.id - use it for lookup
    if (match.matchId) {
      bracketMap.set(match.matchId, match);
    }
  }
  
  // Also build a map from tournament bracketMatches for accurate nextMatchId lookup
  const dbBracketMap = new Map<number, any>();
  for (const bm of tournamentWithBracket.bracketMatches) {
    dbBracketMap.set(bm.id, bm);
  }
  
  // Now ensure BYE winners appear in next rounds (propagate through the bracket)
  for (const bracketMatch of bracket) {
    // If this match has a BYE winner, ensure they appear in the next round
    if (bracketMatch.winnerId && bracketMatch.nextMatchId) {
      // Find the next match using the database bracketMatch structure
      const dbNextMatch = dbBracketMap.get(bracketMatch.nextMatchId);
      if (dbNextMatch) {
        // Find the corresponding bracket entry for the next match
        const nextMatch = bracket.find(m => {
          // Match by round and position since nextMatchId points to BracketMatch.id
          const dbMatch = dbBracketMap.get(bracketMatch.nextMatchId!);
          return dbMatch && m.round === dbMatch.round && m.position === dbMatch.position;
        });
        
        if (nextMatch) {
          // Determine if winner should go to player1 or player2 slot in next match
          // Odd positions (1, 3, 5...) go to player1 slot, even positions (2, 4, 6...) go to player2 slot
          const isPlayer1Slot = (bracketMatch.position - 1) % 2 === 0;
          
          // Update the next match to show the promoted player if slot is empty or needs updating
          if (isPlayer1Slot) {
            // If slot is empty or different from winner, update it
            if (!nextMatch.member1Id || nextMatch.member1Id === null) {
              nextMatch.member1Id = bracketMatch.winnerId;
            }
          } else {
            // If slot is empty or different from winner, update it
            if (!nextMatch.member2Id || nextMatch.member2Id === null) {
              nextMatch.member2Id = bracketMatch.winnerId;
            }
          }
        }
      }
    }
  }
  
  return bracket;
}
