import React, { useState, useMemo, useRef, useEffect } from 'react';
import api from '../utils/api';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { MatchEntryPopup } from './MatchEntryPopup';
import { isOrganizer } from '../utils/auth';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  rating: number | null;
}

interface BracketMatch {
  id?: number; // BracketMatch ID from backend
  round: number;
  position: number;
  player1Id: number | null;
  player2Id: number | null;
  player1IsBye: boolean;
  player2IsBye: boolean;
  matchId?: number;
  winnerId?: number | null;
  nextMatchId?: number | null;
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  player1RatingAtTime?: number | null;
  player2RatingAtTime?: number | null;
  match?: {
    id: number;
    player1RatingBefore: number | null;
    player1RatingChange: number | null;
    player2RatingBefore: number | null;
    player2RatingChange: number | null;
  } | null;
}

interface EditingMatch {
  matchId: number;
  member1Id: number;
  member2Id: number;
  player1Sets: string;
  player2Sets: string;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

interface TournamentParticipant {
  id: number;
  member: Member;
  playerRatingAtTime: number | null;
}

interface TraditionalBracketProps {
  tournamentId?: number;
  tournamentType: string; // Tournament type from plugin registry
  participants: TournamentParticipant[];
  matches: BracketMatch[];
  onMatchUpdate?: () => void;
  isReadOnly?: boolean; // When true, disable all score entry and editing
  showOnlyRound1?: boolean; // When true, only show round 1 matches (for preview/confirmation)
  onHistoryClick?: (playerId: number) => void; // Callback for history button clicks
  tournamentStatus?: 'ACTIVE' | 'COMPLETED'; // Tournament status to determine rating format
}

interface MatchNode {
  round: number;
  position: number;
  player1: TournamentParticipant | null;
  player2: TournamentParticipant | null;
  player1IsBye: boolean;
  player2IsBye: boolean;
  winnerId: number | null;
  matchId?: number; // Match.id if match has been played
  bracketMatchId?: number; // BracketMatch.id for unplayed matches
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  matchRatingData?: {
    player1RatingBefore: number | null;
    player1RatingChange: number | null;
    player2RatingBefore: number | null;
    player2RatingChange: number | null;
  };
}

export const TraditionalBracket: React.FC<TraditionalBracketProps> = ({
  tournamentId,
  tournamentType,
  participants,
  matches,
  onMatchUpdate,
  isReadOnly = false,
  showOnlyRound1 = false,
  onHistoryClick,
  tournamentStatus = 'ACTIVE',
}) => {
  const [editingMatch, setEditingMatch] = useState<EditingMatch | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Calculate current rating for each player per round (incremental changes)
  // This tracks rating changes incrementally: each round shows change from previous round
  const playerRatingsPerRound = useMemo(() => {
    // Map: round -> playerId -> rating
    const ratingsByRound = new Map<number, Map<number, number>>();
    const playerMap = new Map(participants.map(p => [p.member.id, p]));
    
    // Initialize all players with their pre-tournament rating (round 0 = initial)
    const initialRatings = new Map<number, number>();
    participants.forEach(p => {
      if (p.playerRatingAtTime !== null) {
        initialRatings.set(p.member.id, p.playerRatingAtTime);
      }
    });
    ratingsByRound.set(0, initialRatings);
    
    // Process all matches in chronological order (by round, then position)
    const sortedMatches = [...matches].sort((a, b) => {
      const roundA = a.round || 1;
      const roundB = b.round || 1;
      if (roundA !== roundB) {
        return roundA - roundB;
      }
      const posA = a.position || 0;
      const posB = b.position || 0;
      return posA - posB;
    });
    
    // Group matches by round
    const matchesByRound = new Map<number, typeof matches>();
    sortedMatches.forEach(match => {
      const round = match.round || 1;
      if (!matchesByRound.has(round)) {
        matchesByRound.set(round, []);
      }
      matchesByRound.get(round)!.push(match);
    });
    
    // Process each round sequentially
    const maxRound = Math.max(...Array.from(matchesByRound.keys()), 0);
    for (let round = 1; round <= maxRound; round++) {
      const prevRound = round - 1;
      const prevRatings = ratingsByRound.get(prevRound) || initialRatings;
      const currentRatings = new Map(prevRatings); // Start with previous round's ratings
      
      const roundMatches = matchesByRound.get(round) || [];
      
      roundMatches.forEach(bracketMatch => {
        // Check if this is a BYE match
        const isBye = bracketMatch.player1Id === 0 || bracketMatch.player2Id === 0 || 
                     bracketMatch.player2Id === null || 
                     bracketMatch.player1IsBye || bracketMatch.player2IsBye;
        
        // For BYE matches, preserve rating from previous round (no change)
        if (isBye) {
          const nonByePlayerId = bracketMatch.player1Id === 0 || bracketMatch.player1IsBye 
            ? bracketMatch.player2Id 
            : bracketMatch.player1Id;
          if (nonByePlayerId && nonByePlayerId !== 0) {
            const prevRating = prevRatings.get(nonByePlayerId);
            if (prevRating !== undefined) {
              currentRatings.set(nonByePlayerId, prevRating);
            }
          }
          return;
        }
        
        // Skip forfeited matches - they don't change ratings
        if (bracketMatch.player1Forfeit || bracketMatch.player2Forfeit) {
          return;
        }
        
        // Skip matches that haven't been played yet
        const hasBeenPlayed = (bracketMatch.player1Sets !== undefined && bracketMatch.player1Sets > 0) ||
                             (bracketMatch.player2Sets !== undefined && bracketMatch.player2Sets > 0) ||
                             !!bracketMatch.player1Forfeit ||
                             !!bracketMatch.player2Forfeit;
        
        if (!hasBeenPlayed) {
          return;
        }
        
        const player1Id = bracketMatch.player1Id!;
        const player2Id = bracketMatch.player2Id!;
        
        const player1 = playerMap.get(player1Id);
        const player2 = playerMap.get(player2Id);
        
        if (!player1 || !player2) return;
        
        // Use ratings from PREVIOUS round (incremental calculation)
        const ratingBeforeRound1 = prevRatings.get(player1Id) ?? (player1.playerRatingAtTime ?? 1200);
        const ratingBeforeRound2 = prevRatings.get(player2Id) ?? (player2.playerRatingAtTime ?? 1200);
        
        // Determine winner
        const player1Sets = bracketMatch.player1Sets ?? 0;
        const player2Sets = bracketMatch.player2Sets ?? 0;
        const player1Won = player1Sets > player2Sets;
        
        // Calculate rating difference using PREVIOUS ROUND ratings (incremental)
        const ratingDiff = ratingBeforeRound2 - ratingBeforeRound1;
        const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
        
        // Point exchange calculation (matches server logic)
        const absDiff = Math.abs(ratingDiff);
        let points = 8;
        if (absDiff >= 0 && absDiff <= 12) {
          points = isUpset ? 8 : 8;
        } else if (absDiff >= 13 && absDiff <= 37) {
          points = isUpset ? 10 : 7;
        } else if (absDiff >= 38 && absDiff <= 62) {
          points = isUpset ? 13 : 6;
        } else if (absDiff >= 63 && absDiff <= 87) {
          points = isUpset ? 16 : 5;
        } else if (absDiff >= 88 && absDiff <= 112) {
          points = isUpset ? 20 : 4;
        } else if (absDiff >= 113 && absDiff <= 137) {
          points = isUpset ? 25 : 3;
        } else if (absDiff >= 138 && absDiff <= 162) {
          points = isUpset ? 30 : 2;
        } else if (absDiff >= 163 && absDiff <= 187) {
          points = isUpset ? 35 : 2;
        } else if (absDiff >= 188 && absDiff <= 212) {
          points = isUpset ? 40 : 1;
        } else if (absDiff >= 213 && absDiff <= 237) {
          points = isUpset ? 45 : 1;
        } else if (absDiff >= 238 && absDiff <= 262) {
          points = isUpset ? 50 : 0;
        } else if (absDiff >= 263 && absDiff <= 287) {
          points = isUpset ? 55 : 0;
        } else if (absDiff >= 288 && absDiff <= 312) {
          points = isUpset ? 60 : 0;
        } else if (absDiff >= 313 && absDiff <= 337) {
          points = isUpset ? 65 : 0;
        } else if (absDiff >= 338 && absDiff <= 362) {
          points = isUpset ? 70 : 0;
        } else if (absDiff >= 363 && absDiff <= 387) {
          points = isUpset ? 75 : 0;
        } else if (absDiff >= 388 && absDiff <= 412) {
          points = isUpset ? 80 : 0;
        } else if (absDiff >= 413 && absDiff <= 437) {
          points = isUpset ? 85 : 0;
        } else if (absDiff >= 438 && absDiff <= 462) {
          points = isUpset ? 90 : 0;
        } else if (absDiff >= 463 && absDiff <= 487) {
          points = isUpset ? 95 : 0;
        } else if (absDiff >= 488 && absDiff <= 512) {
          points = isUpset ? 100 : 0;
        } else if (absDiff >= 513) {
          points = isUpset ? 100 : 0;
        }
        
        // Calculate rating change for THIS match (incremental from previous round)
        let change1 = 0;
        let change2 = 0;
        
        if (player1Won) {
          change1 = points;
          change2 = -points;
        } else {
          change1 = -points;
          change2 = points;
        }
        
        // Apply incremental changes
        const newRating1 = Math.max(0, Math.round(ratingBeforeRound1 + change1));
        const newRating2 = Math.max(0, Math.round(ratingBeforeRound2 + change2));
        
        // Update current round ratings
        currentRatings.set(player1Id, newRating1);
        currentRatings.set(player2Id, newRating2);
      });
      
      // Store ratings for this round
      ratingsByRound.set(round, currentRatings);
    }
    
    return ratingsByRound;
  }, [participants, matches]);
  
  // Helper function to get player rating at a specific round
  const getPlayerRatingAtRound = (playerId: number, round: number): number | undefined => {
    const roundRatings = playerRatingsPerRound.get(round);
    return roundRatings?.get(playerId);
  };
  
  // Helper function to get rating change for a specific round (incremental)
  const getRatingChangeForRound = (playerId: number, round: number): number | null => {
    if (round === 0) return null; // No change at round 0 (initial)
    
    const prevRound = round - 1;
    const prevRating = getPlayerRatingAtRound(playerId, prevRound);
    const currentRating = getPlayerRatingAtRound(playerId, round);
    
    if (prevRating === undefined || currentRating === undefined) {
      return null;
    }
    
    return currentRating - prevRating;
  };
  
  // ===== Utility Functions =====
  // Calculate the closest power of 2 that is equal to or larger than the given number
  const calculateBracketSize = (playerCount: number): number => {
    const safeCount = Math.max(1, playerCount); // Ensure we don't take log of 0
    const exponent = Math.ceil(Math.log2(safeCount)); // Get the power of 2 needed
    const powerOfTwo = Math.pow(2, exponent); // Calculate the power of 2
    return Math.max(2, powerOfTwo); // Ensure minimum bracket size of 2
  };
  
  // Calculate number of rounds from bracket size
  const calculateRounds = (bracketSize: number): number => Math.log2(bracketSize);
  
  // Calculate number of seeded players based on bracket size (standard: 1/4 rounded to power of 2)
  // Calculate the ceiling of quarter, round to nearest power of 2, and limit between 2 and 32
  const calculateNumSeeded = (bracketSize: number): number => {
    const quarter = Math.ceil(bracketSize / 4); // Get ceiling of quarter
    const safeQuarter = Math.max(1, quarter); // Ensure we don't take log of 0
    const exponent = Math.ceil(Math.log2(safeQuarter)); // Round up to next power of 2
    const powerOfTwo = Math.pow(2, exponent); // Calculate the power of 2
    return Math.max(2, Math.min(32, powerOfTwo)); // Clamp between 2 and 32
  };
  
  // Generate match key from round and position (unused, kept for potential future use)
  // const getMatchKey = (round: number, position: number): string => `${round}-${position}`;
  
  // Calculate number of matches in a given round
  const getNumMatchesInRound = (bracketSize: number, round: number): number => 
    bracketSize / Math.pow(2, round);
  
  // Get slot indices for a match position (0-based bracket positions) (unused, kept for potential future use)
  // const getSlotIndices = (position: number): [number, number] => [
  //   position * 2,
  //   position * 2 + 1
  // ];
  
  // Get previous match indices for a given position in next round (unused, kept for potential future use)
  // const getPrevMatchIndices = (position: number): [number, number] => [
  //   (position - 1) * 2,
  //   (position - 1) * 2 + 1
  // ];
  
  // Get parent match indices for a given match index (for calculating vertical positions)
  const getParentMatchIndices = (matchIndex: number): [number, number] => [
    matchIndex * 2,
    matchIndex * 2 + 1
  ];
  
  // Get previous round number
  const getPreviousRound = (round: number): number => round - 1;
  
  // Check if a match is a BYE match
  const checkIsByeMatch = (match: { player1IsBye?: boolean; player2IsBye?: boolean; player2?: TournamentParticipant | null; player2Id?: number | null }): boolean => 
    (match.player1IsBye || match.player2IsBye || match.player2 === null || match.player2Id === null);
  
  // ===== End Utility Functions =====
  // Calculate seed numbers for each player based on rating order
  // But only assign seeds to players that are actually seeded (top N based on bracket size)
  const playerSeeds = useMemo(() => {
    const sortedByRating = [...participants].sort((a, b) => {
      const ratingA = a.playerRatingAtTime ?? 0;
      const ratingB = b.playerRatingAtTime ?? 0;
      if (ratingB !== ratingA) {
        return ratingB - ratingA; // Higher rating = higher seed
      }
      return a.member.id - b.member.id; // Tiebreaker: lower ID = higher seed
    });
    
    const bracketSizeForSeeding = calculateBracketSize(participants.length);
    const numSeeded = Math.min(calculateNumSeeded(bracketSizeForSeeding), participants.length);
    
    const seedMap = new Map<number, number>();
    sortedByRating.forEach((participant, index) => {
      // Only assign seed numbers to players that are actually seeded (top N)
      if (index < numSeeded) {
        seedMap.set(participant.member.id, index + 1); // Seed 1, 2, 3, ...
      }
      // Players beyond numSeeded don't get seed numbers
    });
    
    return seedMap;
  }, [participants]);
  
  
  
  // Create player lookup map for O(1) access
  const playerMap = useMemo(() => {
    const map = new Map<number, TournamentParticipant>();
    participants.forEach(p => {
      map.set(p.member.id, p);
    });
    return map;
  }, [participants]);
  

  const bracketSize = useMemo(() => calculateBracketSize(participants.length), [participants.length]);
  const totalRounds = useMemo(() => calculateRounds(bracketSize), [bracketSize]);

  // Note: The bracket is fully derived from BracketMatch records - no reconstruction needed

  // Build complete bracket structure directly from ALL BracketMatch records
  // The bracket should be fully derived from the BracketMatch rows - no reconstruction or inference
  const matchesByRound = useMemo(() => {
    
    const grouped: Record<number, MatchNode[]> = {};
    
    if (matches.length === 0) {
      // Return empty structure
      for (let round = 1; round <= totalRounds; round++) {
        grouped[round] = [];
      }
      return grouped;
    }
    
    // Sort matches by round, then by position to ensure correct order
    const sortedMatches = [...matches].sort((a, b) => {
      const roundA = a.round || 1;
      const roundB = b.round || 1;
      if (roundA !== roundB) {
        return roundA - roundB;
      }
      const posA = a.position || 0;
      const posB = b.position || 0;
      return posA - posB;
    });
    
    // Directly map all BracketMatch records to MatchNode structure
    sortedMatches.forEach(bracketMatch => {
      const round = bracketMatch.round || 1;
      const position = bracketMatch.position || 0;
      
      if (!round || !position) {
        return;
      }
      
      if (!grouped[round]) {
        grouped[round] = [];
      }
      
      // Check if this is a BYE match - only 0 opponent should be BYE, not null/unknown
      // null means player is not yet determined (show empty), 0 means actual BYE (show "BYE")
      // Only set isBye to true if memberId is explicitly 0, not if it's null
      const player1IsBye = bracketMatch.player1IsBye || (bracketMatch.player1Id === 0 && bracketMatch.player1Id !== null);
      const player2IsBye = bracketMatch.player2IsBye || (bracketMatch.player2Id === 0 && bracketMatch.player2Id !== null);
      
      // Get player objects from participant map
      const player1Id = (bracketMatch.player1Id === 0 || bracketMatch.player1Id === null) ? null : bracketMatch.player1Id;
      const player2Id = (bracketMatch.player2Id === 0 || bracketMatch.player2Id === null) ? null : bracketMatch.player2Id;
      
      // Determine winner from match result if available
      let winnerId: number | null = null;
      if (bracketMatch.matchId && bracketMatch.player1Sets !== undefined && bracketMatch.player2Sets !== undefined) {
        // Match has been played - determine winner from scores
        if (bracketMatch.player1Sets > (bracketMatch.player2Sets ?? 0)) {
          winnerId = player1Id;
        } else if ((bracketMatch.player2Sets ?? 0) > bracketMatch.player1Sets) {
          winnerId = player2Id;
        } else if (bracketMatch.player1Forfeit) {
          winnerId = player2Id;
        } else if (bracketMatch.player2Forfeit) {
          winnerId = player1Id;
        }
      } else if (bracketMatch.winnerId) {
        winnerId = bracketMatch.winnerId;
      } else if (player2IsBye && player1Id) {
        // BYE match - player1 automatically wins
        winnerId = player1Id;
      }
      
      // Create MatchNode directly from BracketMatch
      // Include match rating data if available
      const matchNode: MatchNode = {
        round,
        position,
        player1: player1Id ? (playerMap.get(player1Id) || null) : null,
        player2: player2Id ? (playerMap.get(player2Id) || null) : null,
        player1IsBye,
        player2IsBye,
        winnerId,
        matchId: bracketMatch.matchId,
        bracketMatchId: bracketMatch.id,
        player1Sets: bracketMatch.player1Sets || 0,
        player2Sets: bracketMatch.player2Sets || 0,
        player1Forfeit: bracketMatch.player1Forfeit || false,
        player2Forfeit: bracketMatch.player2Forfeit || false,
        // Store match rating data for use in display
        matchRatingData: bracketMatch.match ? {
          player1RatingBefore: bracketMatch.match.player1RatingBefore,
          player1RatingChange: bracketMatch.match.player1RatingChange,
          player2RatingBefore: bracketMatch.match.player2RatingBefore,
          player2RatingChange: bracketMatch.match.player2RatingChange,
        } : undefined,
      };
      
      grouped[round].push(matchNode);
    });
    
    // Ensure all rounds are present with proper ordering
    // If any rounds are missing matches, add empty arrays (shouldn't happen if backend sends all rounds)
    for (let round = 1; round <= totalRounds; round++) {
      if (!grouped[round]) {
        grouped[round] = [];
      }
      // Sort by position to ensure correct order
      grouped[round].sort((a, b) => a.position - b.position);
    }
    
    
    return grouped;
  }, [matches, playerMap, totalRounds]);
  
  const rounds = useMemo(() => {
    if (showOnlyRound1) {
      // Only show round 1 in preview/confirmation mode
      return [1];
    }
    return Array.from({ length: totalRounds }, (_, i) => i + 1);
  }, [totalRounds, showOnlyRound1]);
  
  const maxRound = showOnlyRound1 ? 1 : totalRounds;

  // Get round label
  const getRoundLabel = (round: number, maxRound: number, bracketSize: number, matchesByRound?: Record<number, MatchNode[]>): string => {
    if (round === maxRound) return 'Final';
    if (round === maxRound - 1) return 'Semifinals';
    if (round === maxRound - 2) return 'Quarterfinals';
    
    // For round 1, count actual participants (excluding BYEs)
    if (round === 1 && matchesByRound && matchesByRound[1]) {
      const round1Matches = matchesByRound[1];
      const actualParticipants = new Set<number>();
      round1Matches.forEach(match => {
        if (match.player1 && !match.player1IsBye) {
          actualParticipants.add(match.player1.member.id);
        }
        if (match.player2 && !match.player2IsBye) {
          actualParticipants.add(match.player2.member.id);
        }
      });
      return `Round ${round} (${actualParticipants.size})`;
    }
    
    // For all other rounds, use calculated participant count
    const numParticipants = bracketSize / Math.pow(2, round - 1);
    return `Round ${round} (${Math.round(numParticipants)})`;
  };

  // Calculate vertical position for matches in each round
  // In a traditional bracket, each match needs proper spacing
  const MATCH_BOX_HEIGHT = 100; // Height of each match box (contains both players)
  const ROUND_GAP = 150; // Horizontal gap between rounds
  const BOX_WIDTH = 260; // Width of match boxes
  
  // Render a player slot
  const renderPlayerSlot = (
    player: TournamentParticipant | null,
    isBye: boolean,
    isWinner: boolean,
    round: number,
    currentMatch?: MatchNode | null, // Current match for editing
    prevMatch?: MatchNode | null // Optional: pass previous round match info for winner display/editing
  ) => {
    // Calculate clickability first (before early returns)
    const hasPrevMatch = prevMatch && prevMatch.player1 && prevMatch.player2;
    const prevMatchIsBye = prevMatch ? checkIsByeMatch(prevMatch) : false;
    const isClickableForScoreEntry = !isReadOnly && round > 1 && hasPrevMatch && !prevMatchIsBye;
    
    // For round 1, show BYE only if it's actually a BYE (memberId === 0)
    // For later rounds or unknown players (memberId === null), show empty slot
    // isBye is true when memberId === 0, but we need to check if player is null (unknown) vs 0 (BYE)
    if (round === 1 && isBye && player && player.member && player.member.id === 0) {
      // This is an actual BYE in round 1
      return (
        <div style={{
          padding: '8px 12px',
          height: `${MATCH_BOX_HEIGHT}px`,
          backgroundColor: '#f0f0f0',
          border: '1px solid #333',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          color: '#999',
          fontStyle: 'italic',
          boxSizing: 'border-box',
        }}>
          BYE
        </div>
      );
    }
    
    // For later rounds or no player, show empty slot (but make it clickable if prevMatch exists)
    if (!player) {
      return (
        <div 
          style={{
            padding: '8px 12px',
            height: `${MATCH_BOX_HEIGHT}px`,
            backgroundColor: isClickableForScoreEntry ? '#f8f9fa' : '#f9f9f9',
            border: isClickableForScoreEntry ? '2px solid #007bff' : '1px solid #333',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            color: isClickableForScoreEntry ? '#666' : '#bbb',
            boxSizing: 'border-box',
            cursor: isClickableForScoreEntry ? 'pointer' : 'default',
            transition: isClickableForScoreEntry ? 'all 0.2s ease' : 'none',
            pointerEvents: 'auto', // Ensure this element can receive pointer events
            position: 'relative', // Ensure z-index works
            zIndex: 10, // High z-index to be above SVG overlays
          }}
          onClick={(e) => {
            
            if (!isClickableForScoreEntry) {
              return;
            }
            
            if (!prevMatch || !prevMatch.player1 || !prevMatch.player2) {
              return;
            }
            
            e.stopPropagation();
            e.preventDefault();
            
            // Use bracketMatchId from prevMatch, or matchId, or 0 as fallback
            const matchIdToUse = prevMatch.matchId || prevMatch.bracketMatchId || 0;
            
            
            setEditingMatch({
              matchId: matchIdToUse,
              member1Id: prevMatch.player1.member.id,
              member2Id: prevMatch.player2.member.id,
              player1Sets: (prevMatch.player1Sets || 0).toString(),
              player2Sets: (prevMatch.player2Sets || 0).toString(),
              player1Forfeit: prevMatch.player1Forfeit || false,
              player2Forfeit: prevMatch.player2Forfeit || false,
            });
            
          }}
          onMouseEnter={(e) => {
            // Log why double-click might be rejected
            if (!isClickableForScoreEntry) {
              const rejectionReasons: string[] = [];
              
              if (round <= 1) {
                rejectionReasons.push(`Round is ${round} (must be > 1)`);
              }
              
              if (!prevMatch) {
                rejectionReasons.push('No previous match found');
              } else {
                if (!prevMatch.player1) {
                  rejectionReasons.push('Previous match missing player1');
                }
                if (!prevMatch.player2) {
                  rejectionReasons.push('Previous match missing player2');
                }
                if (prevMatchIsBye) {
                  rejectionReasons.push('Previous match is a BYE (no score entry needed)');
                }
              }
              
            } else {
              
              // Apply hover styles
              e.currentTarget.style.backgroundColor = '#e3f2fd';
              e.currentTarget.style.borderColor = '#0056b3';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (isClickableForScoreEntry) {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
              e.currentTarget.style.borderColor = '#007bff';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
          title={isClickableForScoreEntry ? 'Click to enter match result' : ''}
        >
          {isClickableForScoreEntry ? (
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 20 20" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{
                display: 'block',
                margin: '0 auto',
                opacity: 0.8,
              }}
            >
              {/* Score/Result icon - looks like a scoreboard with numbers */}
              <rect 
                x="2" 
                y="3" 
                width="16" 
                height="14" 
                rx="2" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                fill="none"
              />
              {/* Vertical divider line */}
              <line 
                x1="10" 
                y1="3" 
                x2="10" 
                y2="17" 
                stroke="currentColor" 
                strokeWidth="1.5"
              />
              {/* Score numbers - represented as simple digits */}
              <text 
                x="5.5" 
                y="12" 
                fontSize="8" 
                fontWeight="bold" 
                fill="currentColor" 
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
              >
                3
              </text>
              <text 
                x="14.5" 
                y="12" 
                fontSize="8" 
                fontWeight="bold" 
                fill="currentColor" 
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
              >
                1
              </text>
              {/* Colon separator */}
              <circle 
                cx="10" 
                cy="9" 
                r="0.8" 
                fill="currentColor"
              />
              <circle 
                cx="10" 
                cy="11.5" 
                r="0.8" 
                fill="currentColor"
              />
            </svg>
          ) : '\u00A0'}
        </div>
      );
    }
    
    const seed = playerSeeds.get(player.member.id);
    
    // Make box editable if current match exists and has both players
    // BUT: For round 1, players are manually placed, so we don't edit round 1 matches
    const canEditCurrentMatch = round > 1 && tournamentId && currentMatch && currentMatch.matchId && currentMatch.player1 && currentMatch.player2 && !currentMatch.player1IsBye && !currentMatch.player2IsBye;
    
    // Note: hasPrevMatch, prevMatchIsBye, and isClickableForScoreEntry were already calculated above
    
    // Show score box ONLY if:
    // 1. This player came from a previous match (round 2+)
    // 2. The previous match was NOT a BYE match (BYEs don't have scores)
    // Round 1 matches have no scores since players are manually placed
    // Score entry happens in the NEXT round's winner box
    const showScoreBox = hasPrevMatch && round > 1 && !prevMatchIsBye;
    
    // Get score information from previous match only (round 2+)
    // Round 1 has no scores since players are manually placed
    // Score is shown in the winner's box in the next round
    let scoreText = '';
    if (hasPrevMatch && prevMatch && player && round > 1) {
      // Check if this player is the winner of the previous match
      const isPrevWinner = prevMatch.winnerId === player.member.id;
      if (isPrevWinner) {
        // Check if this was a BYE match (player2IsBye flag indicates a BYE)
        const isByeMatch = checkIsByeMatch(prevMatch);
        
        if (!isByeMatch) {
          // Only show score if it's not a BYE match
          if (prevMatch.player1Forfeit) {
            scoreText = 'Forfeit';
          } else if (prevMatch.player2Forfeit) {
            scoreText = 'Forfeit';
          } else {
            const sets1 = prevMatch.player1Sets ?? 0;
            const sets2 = prevMatch.player2Sets ?? 0;
            if (sets1 > 0 || sets2 > 0) {
              // Show score in format: winnerSets:loserSets
              const winnerIsPlayer1 = prevMatch.winnerId === prevMatch.player1?.member.id;
              scoreText = winnerIsPlayer1 ? `${sets1}:${sets2}` : `${sets2}:${sets1}`;
            }
          }
        }
        // If it's a BYE match, scoreText remains empty (no score shown)
      }
    }
    // Round 1 matches have no scores - players are manually placed
    
    return (
      <div 
        style={{
          padding: '8px 12px',
          height: `${MATCH_BOX_HEIGHT}px`,
          backgroundColor: isWinner ? '#d4edda' : (isClickableForScoreEntry ? '#f8f9fa' : 'white'),
          border: isWinner ? '2px solid #333' : (isClickableForScoreEntry ? '2px solid #007bff' : '1px solid #333'),
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          cursor: isClickableForScoreEntry ? 'pointer' : 'default',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: isClickableForScoreEntry ? 'all 0.2s ease' : 'none',
        }}
        onClick={(e) => {
          
          // Round 1: Players are manually placed, no score entry
          if (round === 1) {
            return; // No action for round 1
          }
          
          // Round 2+: Score entry happens in the winner box in the next round
          // If this player came from a previous match (and it wasn't a BYE), allow editing that previous match
          // BYE matches don't have scores and cannot be edited
          // Use bracketMatchId if matchId doesn't exist (for unplayed matches)
          if (isClickableForScoreEntry && prevMatch && prevMatch.player1 && prevMatch.player2) {
            e.stopPropagation();
            e.preventDefault();
            
            // Use bracketMatchId from prevMatch, or matchId, or 0 as fallback
            const matchIdToUse = prevMatch.matchId || prevMatch.bracketMatchId || 0;
            
            
            setEditingMatch({
              matchId: matchIdToUse,
              member1Id: prevMatch.player1.member.id,
              member2Id: prevMatch.player2.member.id,
              player1Sets: (prevMatch.player1Sets || 0).toString(),
              player2Sets: (prevMatch.player2Sets || 0).toString(),
              player1Forfeit: prevMatch.player1Forfeit || false,
              player2Forfeit: prevMatch.player2Forfeit || false,
            });
          }
        }}
        onMouseEnter={(e) => {
          // Log why double-click might be rejected for player boxes
          if (!isClickableForScoreEntry) {
            const rejectionReasons: string[] = [];
            
            if (round <= 1) {
              rejectionReasons.push(`Round is ${round} (must be > 1)`);
            }
            
            if (!prevMatch) {
              rejectionReasons.push('No previous match found');
            } else {
              if (!prevMatch.player1) {
                rejectionReasons.push('Previous match missing player1');
              }
              if (!prevMatch.player2) {
                rejectionReasons.push('Previous match missing player2');
              }
              if (prevMatchIsBye) {
                rejectionReasons.push('Previous match is a BYE (no score entry needed)');
              }
            }
            
          } else {
            
            // Apply hover styles
            e.currentTarget.style.backgroundColor = '#e3f2fd';
            e.currentTarget.style.borderColor = '#0056b3';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }
        }}
        onMouseLeave={(e) => {
          if (isClickableForScoreEntry) {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
            e.currentTarget.style.borderColor = '#007bff';
            e.currentTarget.style.boxShadow = 'none';
          }
        }}
        title={isClickableForScoreEntry ? 'Click to enter/edit match result' : round === 1 ? 'Round 1 - Players are manually placed' : prevMatchIsBye ? 'BYE - No score entry needed' : ''}
      >
        <div style={{ 
          fontWeight: 'bold', 
          fontSize: '14px', 
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          marginBottom: scoreText || canEditCurrentMatch ? '4px' : '0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            {round === 1 && onHistoryClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onHistoryClick(player.member.id);
                }}
                title="View Match History"
                style={{
                  padding: '2px 4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e67e22',
                  marginRight: '4px',
                }}
              >
                📜
              </button>
            )}
            {seed && (
              <span style={{ color: '#666', fontSize: '12px' }}>({seed})</span>
            )}
            <span>
              {formatPlayerName(player.member.firstName, player.member.lastName, getNameDisplayOrder())}
            </span>
          </div>
          {(() => {
            // BYE matches should not show rating changes
            if (isBye) {
              return null;
            }
            
            // Round 1: Show original pre-tournament rating
            // Subsequent rounds: Show current rating with +/- change
            if (round === 1) {
              // Round 1: First check if player lost - show rating change for loser in red
              if (currentMatch && currentMatch.winnerId && currentMatch.winnerId !== player.member.id && 
                  player && player.member) {
                // Player lost in round 1 - show rating change for loser in red
                let loserRatingChange: number | null = null;
                let ratingBeforeMatch: number | undefined = undefined;
                
                if (currentMatch.matchRatingData) {
                  const isPlayer1 = currentMatch.player1?.member.id === player.member.id;
                  if (isPlayer1 && currentMatch.matchRatingData.player1RatingChange !== null) {
                    loserRatingChange = currentMatch.matchRatingData.player1RatingChange;
                    ratingBeforeMatch = currentMatch.matchRatingData.player1RatingBefore ?? undefined;
                  } else if (!isPlayer1 && currentMatch.matchRatingData.player2RatingChange !== null) {
                    loserRatingChange = currentMatch.matchRatingData.player2RatingChange;
                    ratingBeforeMatch = currentMatch.matchRatingData.player2RatingBefore ?? undefined;
                  }
                }
                
                // Show rating change for loser in red if available (on same line)
                // Format: (ratingBefore) (change/finalRating) - all in red
                if (loserRatingChange !== null && loserRatingChange < 0 && ratingBeforeMatch !== undefined) {
                  const finalRating = ratingBeforeMatch + loserRatingChange;
                  return (
                    <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                      ({ratingBeforeMatch}) <span style={{ color: '#e74c3c' }}>({loserRatingChange}/{finalRating})</span>
                    </div>
                  );
                }
              }
              
              // Round 1: Show original pre-tournament rating (if not a loser or no rating data)
              if (player.playerRatingAtTime !== null) {
                return (
                  <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                    ({player.playerRatingAtTime})
                  </div>
                );
              }
            } else {
              // Subsequent rounds: Show incremental rating change from previous round
              // Check if this player won a match in a previous round (they have a match result)
              const hasWonPreviousMatch = prevMatch && 
                                         prevMatch.winnerId === player.member.id &&
                                         ((prevMatch.player1Sets !== undefined && prevMatch.player1Sets > 0) || 
                                          (prevMatch.player2Sets !== undefined && prevMatch.player2Sets > 0) || 
                                          prevMatch.player1Forfeit === true || 
                                          prevMatch.player2Forfeit === true);
              
              // Only show rating if player won their previous match (not just placed in bracket)
              if (hasWonPreviousMatch) {
                // Check if this is a BYE - if so, preserve rating from previous round without showing increment
                const isBye = player.member.id === 0 || 
                             (prevMatch && (prevMatch.player1IsBye || prevMatch.player2IsBye));
                
                if (isBye) {
                  const prevRoundRating = getPlayerRatingAtRound(player.member.id, round - 1);
                  if (prevRoundRating !== undefined) {
                    // BYE case: show rating from previous round without +/- increment (just the rating)
                    return (
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                        ({prevRoundRating})
                      </div>
                    );
                  }
                } else {
                  // Try to use stored rating change from match record first
                  let ratingChange: number | null = null;
                  let currentRating: number | undefined = undefined;
                  
                  // Check if prevMatch has stored rating data
                  if (prevMatch && prevMatch.matchRatingData) {
                    const isPlayer1 = prevMatch.player1?.member.id === player.member.id;
                    if (isPlayer1 && prevMatch.matchRatingData.player1RatingChange !== null) {
                      ratingChange = prevMatch.matchRatingData.player1RatingChange;
                      const ratingBefore = prevMatch.matchRatingData.player1RatingBefore ?? 0;
                      currentRating = ratingBefore + ratingChange;
                    } else if (!isPlayer1 && prevMatch.matchRatingData.player2RatingChange !== null) {
                      ratingChange = prevMatch.matchRatingData.player2RatingChange;
                      const ratingBefore = prevMatch.matchRatingData.player2RatingBefore ?? 0;
                      currentRating = ratingBefore + ratingChange;
                    }
                  }
                  
                  // Fall back to calculated rating if stored data not available
                  if (ratingChange === null) {
                    currentRating = getPlayerRatingAtRound(player.member.id, round);
                    ratingChange = getRatingChangeForRound(player.member.id, round);
                  }
                  
                  if (currentRating !== undefined && ratingChange !== null) {
                    // Show incremental change from previous round
                    const changeStr = ratingChange >= 0 ? `+${ratingChange}` : `${ratingChange}`;
                    return (
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                        ({currentRating} / {changeStr})
                      </div>
                    );
                  } else {
                    // Fallback: show previous round rating if current not calculated
                    const prevRoundRating = getPlayerRatingAtRound(player.member.id, round - 1);
                    if (prevRoundRating !== undefined) {
                      return (
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                          ({prevRoundRating})
                        </div>
                      );
                    }
                  }
                }
              }
              
              // Check if this player lost in the current match - show rating change in red
              // This applies to all rounds where a match has been played and this player lost
              if (currentMatch && currentMatch.winnerId && currentMatch.winnerId !== player.member.id && 
                  player && player.member) {
                // Player lost this match - show rating change for loser in red
                let loserRatingChange: number | null = null;
                let ratingBeforeMatch: number | undefined = undefined;
                
                // Get rating change from stored match data
                if (currentMatch.matchRatingData) {
                  const isPlayer1 = currentMatch.player1?.member.id === player.member.id;
                  if (isPlayer1 && currentMatch.matchRatingData.player1RatingChange !== null) {
                    loserRatingChange = currentMatch.matchRatingData.player1RatingChange;
                    ratingBeforeMatch = currentMatch.matchRatingData.player1RatingBefore ?? undefined;
                  } else if (!isPlayer1 && currentMatch.matchRatingData.player2RatingChange !== null) {
                    loserRatingChange = currentMatch.matchRatingData.player2RatingChange;
                    ratingBeforeMatch = currentMatch.matchRatingData.player2RatingBefore ?? undefined;
                  }
                }
                
                // Only show if we have rating data and it's negative (loser loses points)
                if (loserRatingChange !== null && loserRatingChange < 0 && ratingBeforeMatch !== undefined) {
                  const finalRating = ratingBeforeMatch + loserRatingChange;
                  
                  // Check if this is a BYE or first round - if so, don't show / +0
                  const isByeOrFirstRound = round === 1 || 
                                           (prevMatch && (prevMatch.player1IsBye || prevMatch.player2IsBye));
                  
                  // Determine what to show before the red part
                  // For round 1/BYE: show rating before match only
                  // For subsequent rounds: show rating after previous match win (if they won) with that change
                  let prevRatingDisplay = `(${ratingBeforeMatch})`;
                  
                  if (!isByeOrFirstRound && prevMatch && prevMatch.winnerId === player.member.id) {
                    // Player won the previous match - show their rating after that win with the change
                    let prevRatingChange: number | null = null;
                    let prevRatingBefore: number | null = null;
                    
                    if (prevMatch.matchRatingData) {
                      const isPlayer1 = prevMatch.player1?.member.id === player.member.id;
                      if (isPlayer1) {
                        prevRatingChange = prevMatch.matchRatingData.player1RatingChange ?? null;
                        prevRatingBefore = prevMatch.matchRatingData.player1RatingBefore ?? null;
                      } else {
                        prevRatingChange = prevMatch.matchRatingData.player2RatingChange ?? null;
                        prevRatingBefore = prevMatch.matchRatingData.player2RatingBefore ?? null;
                      }
                    }
                    
                    // If we have previous match data, show rating after that win
                    if (prevRatingChange !== null && prevRatingBefore !== null) {
                      const ratingAfterPrevWin = prevRatingBefore + prevRatingChange;
                      prevRatingDisplay = `(${ratingAfterPrevWin} / ${prevRatingChange >= 0 ? '+' : ''}${prevRatingChange})`;
                    } else {
                      // Fallback: use current rating before match with +0
                      prevRatingDisplay = `(${ratingBeforeMatch} / +0)`;
                    }
                  } else if (!isByeOrFirstRound) {
                    // Player didn't win previous match (e.g., BYE) - show rating with +0
                    prevRatingDisplay = `(${ratingBeforeMatch} / +0)`;
                  }
                  
                  // Show rating before match, then change/final in red
                  return (
                    <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                      {prevRatingDisplay} <span style={{ color: '#e74c3c' }}>({loserRatingChange}/{finalRating})</span>
                    </div>
                  );
                }
              }
              
              // If player hasn't won a match yet, don't show rating (they're just placed in bracket)
            }
            return null;
          })()}
        </div>
        {/* Show score box indicator - smaller box with score or "Score" text */}
        {showScoreBox && (
          <div 
            style={{
              marginTop: '4px',
              padding: '4px 8px',
              backgroundColor: scoreText ? '#f0f0f0' : '#fff3cd',
              border: '1px solid #333',
              borderRadius: '3px',
              fontSize: '10px',
              color: scoreText ? '#333' : '#856404',
              fontWeight: scoreText ? 'bold' : 'normal',
              textAlign: 'center',
              cursor: 'pointer',
              minHeight: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              
              // Round 1: No score boxes (players are manually placed)
              if (round === 1) {
                return;
              }
              
              // Round 2+: Score entry opens the previous match that this player won
              // Score boxes only appear for players who came from a previous match
              // BYE matches don't have scores and cannot be edited
              // Use bracketMatchId if matchId doesn't exist (for unplayed matches)
              if (hasPrevMatch && !prevMatchIsBye && prevMatch && prevMatch.player1 && prevMatch.player2) {
                e.stopPropagation();
                e.preventDefault();
                
                // Use bracketMatchId from prevMatch, or matchId, or 0 as fallback
                const matchIdToUse = prevMatch.matchId || prevMatch.bracketMatchId || 0;
                
                setEditingMatch({
                  matchId: matchIdToUse,
                  member1Id: prevMatch.player1.member.id,
                  member2Id: prevMatch.player2.member.id,
                  player1Sets: (prevMatch.player1Sets || 0).toString() || '0',
                  player2Sets: (prevMatch.player2Sets || 0).toString() || '0',
                  player1Forfeit: prevMatch.player1Forfeit || false,
                  player2Forfeit: prevMatch.player2Forfeit || false,
                });
              }
            }}
          >
            {scoreText || 'Score'}
          </div>
        )}
      </div>
    );
  };

  // Render a match box (both players in one box with score button in middle)
  const renderMatchBox = (
    match: MatchNode
  ) => {
    const player1 = match.player1;
    const player2 = match.player2;
    const player1IsBye = match.player1IsBye;
    const player2IsBye = match.player2IsBye;
    
    // Determine if match can be edited - only organizers can edit, and match must be valid
    const isUserOrganizer = isOrganizer();
    const canEditMatch = isUserOrganizer && !isReadOnly && tournamentId && player1 && player2 && !player1IsBye && !player2IsBye;
    
    // Get scores
    const player1Sets = match.player1Sets ?? 0;
    const player2Sets = match.player2Sets ?? 0;
    // Don't consider 0:0 as a score - show entry icon instead
    const hasScore = (player1Sets > 0 || player2Sets > 0) && !(player1Sets === 0 && player2Sets === 0);
    const isForfeit = match.player1Forfeit || match.player2Forfeit;
    const hasResult = hasScore || isForfeit || (match.winnerId !== null && match.winnerId !== undefined);
    const player1Won = hasResult && (match.winnerId === player1?.member.id || (hasScore && !isForfeit && player1Sets > player2Sets) || (isForfeit && match.player2Forfeit));
    const player2Won = hasResult && (match.winnerId === player2?.member.id || (hasScore && !isForfeit && player2Sets > player1Sets) || (isForfeit && match.player1Forfeit));
    
    // Get seeding numbers for round 1 - only show for players that were actually seeded
    const player1Seed = match.round === 1 && player1 ? playerSeeds.get(player1.member.id) : null;
    const player2Seed = match.round === 1 && player2 ? playerSeeds.get(player2.member.id) : null;
    
    // Get rating data
    const player1RatingBefore = match.matchRatingData?.player1RatingBefore ?? null;
    const player1RatingChange = match.matchRatingData?.player1RatingChange ?? null;
    const player2RatingBefore = match.matchRatingData?.player2RatingBefore ?? null;
    const player2RatingChange = match.matchRatingData?.player2RatingChange ?? null;
    
    // Calculate new ratings
    const player1NewRating = player1RatingBefore !== null && player1RatingChange !== null 
      ? player1RatingBefore + player1RatingChange 
      : null;
    const player2NewRating = player2RatingBefore !== null && player2RatingChange !== null 
      ? player2RatingBefore + player2RatingChange 
      : null;
    
    // Format rating change display
    const formatRatingChange = (change: number | null) => {
      if (change === null) return null;
      const sign = change >= 0 ? '+' : '';
      return `${sign}${change}`;
    };
    
    // Player names
    // Only show "BYE" if it's an actual BYE (memberId === 0), not for unknown players (null)
    // If player is null or memberId is null, show empty string (unknown player, not yet determined)
    const player1Name = (player1IsBye && player1 && player1.member && player1.member.id === 0) ? 'BYE' : (player1 && player1.member && player1.member.id !== 0 && player1.member.id !== null ? formatPlayerName(player1.member.firstName, player1.member.lastName, getNameDisplayOrder()) : '');
    const player2Name = (player2IsBye && player2 && player2.member && player2.member.id === 0) ? 'BYE' : (player2 && player2.member && player2.member.id !== 0 && player2.member.id !== null ? formatPlayerName(player2.member.firstName, player2.member.lastName, getNameDisplayOrder()) : '');
    
    return (
      <div
        style={{
          width: `${BOX_WIDTH}px`,
          minHeight: `${MATCH_BOX_HEIGHT}px`,
          border: '2px solid #333',
          borderRadius: '6px',
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center',
          padding: '10px',
          gap: '10px',
          position: 'relative',
          cursor: canEditMatch ? 'pointer' : 'default',
          transition: canEditMatch ? 'all 0.2s ease' : 'none',
          boxSizing: 'border-box',
        }}
        onClick={(e) => {
          if (canEditMatch && !hasScore && !isForfeit) {
            e.stopPropagation();
            setEditingMatch({
              matchId: match.matchId || 0,
              member1Id: player1!.member.id,
              member2Id: player2!.member.id,
              player1Sets: player1Sets.toString(),
              player2Sets: player2Sets.toString(),
              player1Forfeit: match.player1Forfeit || false,
              player2Forfeit: match.player2Forfeit || false,
            });
          }
        }}
        onMouseEnter={(e) => {
          if (canEditMatch) {
            e.currentTarget.style.backgroundColor = '#e3f2fd';
            e.currentTarget.style.borderColor = '#0056b3';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }
        }}
        onMouseLeave={(e) => {
          if (canEditMatch) {
            e.currentTarget.style.backgroundColor = '#fff';
            e.currentTarget.style.borderColor = '#333';
            e.currentTarget.style.boxShadow = 'none';
          }
        }}
        title={canEditMatch ? 'Click to enter/edit match result' : ''}
      >
        {/* Player 1 */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-start', 
          gap: '2px',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            width: '100%',
            minHeight: '20px', // Ensure consistent height for alignment
          }}>
            {player1Seed !== null && player1Seed !== undefined && (
              <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal' }}>({player1Seed})</span>
            )}
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{player1Name}</span>
            {hasResult && player1Won && (
              <span style={{ color: '#27ae60', fontSize: '18px', fontWeight: 'bold' }}>✓</span>
            )}
          </div>
          {/* Rating directly under the name */}
          <div style={{ marginLeft: player1Seed !== null && player1Seed !== undefined ? '18px' : '0' }}>
            {/* Round 1: Show initial tournament rating if no match result yet */}
            {match.round === 1 && !hasResult && player1 && player1.playerRatingAtTime !== null && (
              <span style={{ 
                fontSize: '9px', 
                color: '#666',
                fontWeight: '400',
              }}>
                ({player1.playerRatingAtTime})
              </span>
            )}
            {/* Show rating change after match result */}
            {hasResult && player1RatingChange !== null && (
              <span style={{ 
                fontSize: '9px', 
                color: '#666',
                fontWeight: '400',
              }}>
                {player1NewRating !== null ? `${player1NewRating} ` : ''}({formatRatingChange(player1RatingChange)})
              </span>
            )}
          </div>
          {isForfeit && match.player1Forfeit && (
            <span style={{ fontSize: '10px', color: '#e74c3c', fontStyle: 'italic' }}>walkover</span>
          )}
        </div>
        
        {/* Score Button/Icon or Score Display - same position */}
        {!hasScore && !isForfeit && canEditMatch ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer',
            minWidth: '60px', // Reserve space for score display
            height: '20px', // Match the height of score text
          }}>
            <button
              style={{
                padding: '0',
                border: '1px solid #90EE90',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'stretch',
                width: '45px',
                height: '18px',
                overflow: 'hidden',
                opacity: 0.7, // Make it appear smaller/lighter
              }}
              onClick={(e) => {
                e.stopPropagation();
                setEditingMatch({
                  matchId: match.matchId || 0,
                  member1Id: player1!.member.id,
                  member2Id: player2!.member.id,
                  player1Sets: '0',
                  player2Sets: '0',
                  player1Forfeit: false,
                  player2Forfeit: false,
                });
              }}
              title="Enter score"
            >
              {/* Left section */}
              <div style={{
                flex: 1,
                backgroundColor: '#ADD8E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#228B22',
                fontSize: '10px',
                fontWeight: 'bold',
                borderRight: '1px solid #90EE90',
              }}>
                ?
              </div>
              {/* Right section */}
              <div style={{
                flex: 1,
                backgroundColor: '#ADD8E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#228B22',
                fontSize: '10px',
                fontWeight: 'bold',
              }}>
                ?
              </div>
            </button>
          </div>
        ) : hasScore && !isForfeit ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            minWidth: '60px', // Same as entry button container
            height: '20px', // Same as entry button container
          }}>
            <span style={{ fontSize: '14px', color: '#666', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{player1Sets} - {player2Sets}</span>
          </div>
        ) : null}
        
        {/* Player 2 */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-end', 
          gap: '2px',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            width: '100%', 
            justifyContent: 'flex-end',
            minHeight: '20px', // Ensure consistent height for alignment
          }}>
            {hasResult && player2Won && (
              <span style={{ color: '#27ae60', fontSize: '18px', fontWeight: 'bold' }}>✓</span>
            )}
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{player2Name}</span>
            {player2Seed !== null && player2Seed !== undefined && (
              <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal' }}>({player2Seed})</span>
            )}
          </div>
          {/* Rating directly under the name */}
          <div style={{ 
            marginRight: player2Seed !== null && player2Seed !== undefined ? '18px' : '0',
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            {/* Round 1: Show initial tournament rating if no match result yet */}
            {match.round === 1 && !hasResult && player2 && player2.playerRatingAtTime !== null && (
              <span style={{ 
                fontSize: '9px', 
                color: '#666',
                fontWeight: '400',
              }}>
                ({player2.playerRatingAtTime})
              </span>
            )}
            {/* Show rating change after match result */}
            {hasResult && player2RatingChange !== null && (
              <span style={{ 
                fontSize: '9px', 
                color: '#666',
                fontWeight: '400',
              }}>
                {player2NewRating !== null ? `${player2NewRating} ` : ''}({formatRatingChange(player2RatingChange)})
              </span>
            )}
          </div>
          {isForfeit && match.player2Forfeit && (
            <span style={{ fontSize: '10px', color: '#e74c3c', fontStyle: 'italic' }}>walkover</span>
          )}
        </div>
      </div>
    );
  };

  // Calculate total height needed for all rounds
  const totalBracketHeight = useMemo(() => {
    if (rounds.length === 0) return MATCH_BOX_HEIGHT;
    let maxHeight = MATCH_BOX_HEIGHT;
    rounds.forEach(round => {
      const numMatches = matchesByRound[round]?.length || 0;
      if (numMatches > 0) {
        const roundHeight = numMatches * MATCH_BOX_HEIGHT + (numMatches - 1) * 20; // 20px gap between matches
        if (roundHeight > maxHeight) {
          maxHeight = roundHeight;
        }
      }
    });
    return maxHeight;
  }, [rounds, matchesByRound]);
  
  // Calculate how many slots a round needs vertically
  const calculateRoundHeight = useMemo(() => {
    const heightMap = new Map<number, number>();
    rounds.forEach(round => {
      const numMatches = matchesByRound[round]?.length || 0;
      heightMap.set(round, numMatches === 0 ? MATCH_BOX_HEIGHT : numMatches * MATCH_BOX_HEIGHT + (numMatches - 1) * 20);
    });
    return (roundNum: number): number => {
      return heightMap.get(roundNum) || MATCH_BOX_HEIGHT;
    };
  }, [rounds, matchesByRound]);

  // Helper function to calculate vertical position of a match
  const calculateMatchTopPosition = (round: number, matchIndex: number): number => {
    const matchSpacing = MATCH_BOX_HEIGHT + 20; // 20px gap between matches
    
    if (round === 1) {
      // First round: evenly spaced from top
      return matchIndex * matchSpacing;
    } else if (round === maxRound) {
      // Final round: center vertically in the bracket
      const bracketCenter = totalBracketHeight / 2;
      return bracketCenter - MATCH_BOX_HEIGHT / 2;
    } else {
      // Later rounds (not final): align with center of parent matches
      const prevRoundMatches = matchesByRound[getPreviousRound(round)] || [];
      const [parentMatch1Index, parentMatch2Index] = getParentMatchIndices(matchIndex);
      
      if (parentMatch1Index < prevRoundMatches.length && parentMatch2Index < prevRoundMatches.length) {
        // Calculate positions of parent matches recursively
        const parent1Top = calculateMatchTopPosition(getPreviousRound(round), parentMatch1Index);
        const parent2Top = calculateMatchTopPosition(getPreviousRound(round), parentMatch2Index);
        const parent1Center = parent1Top + MATCH_BOX_HEIGHT / 2;
        const parent2Center = parent2Top + MATCH_BOX_HEIGHT / 2;
        // Position this match at the center between the two parent matches
        const centerY = (parent1Center + parent2Center) / 2;
        return centerY - MATCH_BOX_HEIGHT / 2;
      } else {
        // Fallback: evenly spaced
        return matchIndex * matchSpacing;
      }
    }
  };

  const handleSaveMatch = async () => {
    
    if (!editingMatch || !tournamentId) {
      return;
    }

    if (editingMatch.player1Forfeit && editingMatch.player2Forfeit) {
      alert('Only one player can forfeit');
      return;
    }

    // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
    if (!editingMatch.player1Forfeit && !editingMatch.player2Forfeit) {
      const player1Sets = parseInt(editingMatch.player1Sets) || 0;
      const player2Sets = parseInt(editingMatch.player2Sets) || 0;
      // Disallow equal scores including 0:0
      if (player1Sets === player2Sets) {
        alert('Scores cannot be equal. One player must win.');
        return;
      }
    }

    const matchData: any = {
      member1Id: editingMatch.member1Id,
      member2Id: editingMatch.member2Id,
    };

    // If forfeit, send forfeit flags; otherwise send sets
    if (editingMatch.player1Forfeit || editingMatch.player2Forfeit) {
      matchData.player1Forfeit = editingMatch.player1Forfeit;
      matchData.player2Forfeit = editingMatch.player2Forfeit;
    } else {
      matchData.player1Sets = parseInt(editingMatch.player1Sets) || 0;
      matchData.player2Sets = parseInt(editingMatch.player2Sets) || 0;
      matchData.player1Forfeit = false;
      matchData.player2Forfeit = false;
    }

    // Find the match node being saved
    let matchBeingSaved: MatchNode | undefined;
    if (editingMatch.matchId === 0) {
      // Find by player IDs in matchesByRound
      for (const roundMatches of Object.values(matchesByRound)) {
        const found = roundMatches.find(m => 
          m.player1?.member.id === editingMatch.member1Id && 
          m.player2?.member.id === editingMatch.member2Id
        );
        if (found) {
          matchBeingSaved = found;
          break;
        }
      }
    } else {
      // Find by matchId
      for (const roundMatches of Object.values(matchesByRound)) {
        const found = roundMatches.find(m => m.matchId === editingMatch.matchId);
        if (found) {
          matchBeingSaved = found;
          break;
        }
      }
    }
    const isFinalMatch = matchBeingSaved && matchBeingSaved.round === maxRound;

    try {
      // For bracket matches, if matchId is 0, we need to use the bracketMatchId
      // The endpoint /tournaments/:tournamentId/matches/:matchId accepts bracketMatchId as matchId
      let matchIdToUse = editingMatch.matchId;
      
      if (matchIdToUse === 0) {
        // Find bracket match and use its ID
        if (matchBeingSaved?.bracketMatchId) {
          matchIdToUse = matchBeingSaved.bracketMatchId;
        } else {
          // Find the original bracket match from matches array
          const bracketMatch = matches.find(m => 
            m.player1Id === editingMatch.member1Id && 
            m.player2Id === editingMatch.member2Id &&
            m.id
          );
          if (bracketMatch?.id) {
            matchIdToUse = bracketMatch.id;
          } else {
            throw new Error('Bracket match not found');
          }
        }
      }
      
      await api.patch(`/tournaments/${tournamentId}/matches/${matchIdToUse}`, matchData);
      
      // If this is the final match, auto-complete the tournament
      if (isFinalMatch) {
        try {
          await api.patch(`/tournaments/${tournamentId}/complete`);
        } catch (completeError: any) {
          // If auto-complete fails, silently continue (don't block the match save)
        }
      }
      
      setEditingMatch(null);
      if (onMatchUpdate) {
        onMatchUpdate();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update match';
      alert(errorMessage);
    }
  };
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        padding: '0 20px 20px 20px', 
        overflowX: 'auto',
        overflowY: 'auto',
        backgroundColor: 'white',
        width: '100%',
        maxHeight: '80vh',
        position: 'relative',
      }}
    >
      {/* Round Headers - Sticky with grey background */}
      {(() => {
        // Calculate total content width to match bracket tree exactly
        // Bracket tree uses flex with gap, so: BOX_WIDTH per round + ROUND_GAP between rounds
        const bracketContentWidth = (BOX_WIDTH * rounds.length) + (ROUND_GAP * (rounds.length - 1));
        // Header has 20px padding on each side, so total width = content + 40px
        // With negative margins of -20px each side, the visual box extends to match bracket tree
        const totalHeaderWidth = bracketContentWidth + 40;
        
        return (
          <div 
            style={{ 
              display: 'flex', 
              gap: `${ROUND_GAP}px`, // Match the bracket tree gap
              marginBottom: '20px',
              marginLeft: '-20px',
              marginRight: '-20px',
              paddingLeft: '20px',
              paddingRight: '20px',
              paddingTop: '10px',
              paddingBottom: '10px',
              border: '2px solid #333',
              borderRadius: '4px',
              position: 'sticky',
              top: 0,
              backgroundColor: '#e9ecef',
              zIndex: 10,
              width: `${totalHeaderWidth}px`,
              boxSizing: 'border-box',
            }}
          >
            {rounds.map((round, index) => {
              // Calculate round label before rendering
              const roundLabel = getRoundLabel(round, maxRound, bracketSize, matchesByRound);
              // Each round header is exactly BOX_WIDTH to match the round columns below
              // Match boxes use border-box, so BOX_WIDTH includes the 2px border on each side
              // The gap between headers is handled by flex gap, just like in the bracket tree
              return (
                <div
                  key={round}
                  style={{
                    width: `${BOX_WIDTH}px`,
                    minWidth: `${BOX_WIDTH}px`,
                    maxWidth: `${BOX_WIDTH}px`,
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: round === maxRound ? '18px' : '14px',
                    color: round === maxRound ? '#e74c3c' : '#333',
                    backgroundColor: '#e9ecef',
                    padding: 0,
                    margin: 0,
                    flexShrink: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  {roundLabel}
                </div>
              );
            })}
          </div>
        );
      })()}
      
      {/* Bracket Tree */}
      <div style={{ 
        position: 'relative', 
        display: 'flex', 
        gap: `${ROUND_GAP}px`,
        minHeight: `${totalBracketHeight}px`,
        height: `${totalBracketHeight}px`,
      }}>
        {rounds.map((round, roundIndex) => {
          const roundMatches = matchesByRound[round] || [];
          const isLastRound = round === maxRound;
          
          return (
            <div
              key={round}
              style={{
                width: `${BOX_WIDTH}px`,
                minWidth: `${BOX_WIDTH}px`,
                maxWidth: `${BOX_WIDTH}px`,
                position: 'relative',
                minHeight: `${calculateRoundHeight(round)}px`,
              }}
            >
              {roundMatches.map((match, matchIndex) => {
                // Calculate vertical position for this match
                const topPosition = calculateMatchTopPosition(round, matchIndex);
                
                // Find the previous round match that produced player1 (if in round > 1)
                // Also include the current match for round 1 players
                let prevMatchForPlayer1: MatchNode | null = null;
                let prevMatchForPlayer2: MatchNode | null = null;
                
                if (round === 1) {
                  // For round 1, the match itself is editable
                  if (match.matchId && match.player1 && match.player2) {
                    prevMatchForPlayer1 = match;
                  }
                  if (match.matchId && match.player1 && match.player2) {
                    prevMatchForPlayer2 = match;
                  }
                } else {
                  // For later rounds, find the previous round match that could produce this player
                  const prevRound = getPreviousRound(round);
                  const prevRoundMatches = matchesByRound[prevRound] || [];
                  // Player1 in this match comes from the first match in the pair from previous round
                  const [prevMatchIndex1, prevMatchIndex2] = getParentMatchIndices(matchIndex);
                  if (prevRoundMatches[prevMatchIndex1]) {
                    const prevMatch = prevRoundMatches[prevMatchIndex1];
                    // Always set prevMatch if both players are determined in the previous match
                    // This makes the box in the next round clickable to enter scores
                    // We don't check if the player matches because in round 2+, the player might not be set yet
                    const hasBothPlayers = prevMatch.player1 && prevMatch.player2 && !prevMatch.player1IsBye && !prevMatch.player2IsBye;
                    if (hasBothPlayers) {
                      prevMatchForPlayer1 = prevMatch;
                    } else {
                      // Fallback: check if player matches (for when winner is already determined)
                      if (match.player1 && (
                        prevMatch.winnerId === match.player1.member.id ||
                        (prevMatch.player1?.member.id === match.player1.member.id) ||
                        (prevMatch.player2?.member.id === match.player1.member.id) ||
                        // BYE case
                        (prevRound === 1 && prevMatch.player1IsBye && prevMatch.player2?.member.id === match.player1.member.id) ||
                        (prevRound === 1 && prevMatch.player2IsBye && prevMatch.player1?.member.id === match.player1.member.id)
                      )) {
                        prevMatchForPlayer1 = prevMatch;
                      }
                    }
                  }
                  
                  // Player2 in this match comes from the second match in the pair from previous round
                  if (prevRoundMatches[prevMatchIndex2]) {
                    const prevMatch = prevRoundMatches[prevMatchIndex2];
                    // Always set prevMatch if both players are determined in the previous match
                    // This makes the box in the next round clickable to enter scores
                    const hasBothPlayers = prevMatch.player1 && prevMatch.player2 && !prevMatch.player1IsBye && !prevMatch.player2IsBye;
                    if (hasBothPlayers) {
                      prevMatchForPlayer2 = prevMatch;
                    } else {
                      // Fallback: check if player matches (for when winner is already determined)
                      if (match.player2 && (
                        prevMatch.winnerId === match.player2.member.id ||
                        (prevMatch.player1?.member.id === match.player2.member.id) ||
                        (prevMatch.player2?.member.id === match.player2.member.id) ||
                        // BYE case
                        (prevRound === 1 && prevMatch.player1IsBye && prevMatch.player2?.member.id === match.player2.member.id) ||
                        (prevRound === 1 && prevMatch.player2IsBye && prevMatch.player1?.member.id === match.player2.member.id)
                      )) {
                        prevMatchForPlayer2 = prevMatch;
                      }
                    }
                  }
                }
                
                // For round 1, show both player boxes
                // For rounds > 1, show both winner boxes (same structure, but they're winners from previous round)
                return (
                  <div
                    key={match.matchId || `match-${round}-${match.position}`}
                    style={{
                      position: 'absolute',
                      top: `${topPosition}px`,
                      left: 0,
                      right: 0,
                      zIndex: 2, // Ensure match div is above SVG lines
                    }}
                  >
                    {/* Render match as single box */}
                    {(() => {
                      // Determine actual player1 and player2 for this match
                      let actualPlayer1: TournamentParticipant | null = null;
                      let actualPlayer2: TournamentParticipant | null = null;
                      let actualPlayer1IsBye = match.player1IsBye;
                      let actualPlayer2IsBye = match.player2IsBye;
                      
                      if (match.player1 && match.player2) {
                        // Players already set in match
                        actualPlayer1 = match.player1;
                        actualPlayer2 = match.player2;
                      } else {
                        // Derive from previous matches
                        if (prevMatchForPlayer1) {
                          const isBye1 = prevMatchForPlayer1.player1IsBye || prevMatchForPlayer1.player2IsBye;
                          if (prevMatchForPlayer1.winnerId || isBye1) {
                            if (isBye1) {
                              actualPlayer1 = prevMatchForPlayer1.player1IsBye ? prevMatchForPlayer1.player2 : prevMatchForPlayer1.player1;
                            } else {
                              actualPlayer1 = prevMatchForPlayer1.player1?.member.id === prevMatchForPlayer1.winnerId 
                                ? prevMatchForPlayer1.player1 
                                : prevMatchForPlayer1.player2;
                            }
                          }
                        }
                        
                        if (prevMatchForPlayer2) {
                          const isBye2 = prevMatchForPlayer2.player1IsBye || prevMatchForPlayer2.player2IsBye;
                          if (prevMatchForPlayer2.winnerId || isBye2) {
                            if (isBye2) {
                              actualPlayer2 = prevMatchForPlayer2.player1IsBye ? prevMatchForPlayer2.player2 : prevMatchForPlayer2.player1;
                            } else {
                              actualPlayer2 = prevMatchForPlayer2.player1?.member.id === prevMatchForPlayer2.winnerId 
                                ? prevMatchForPlayer2.player1 
                                : prevMatchForPlayer2.player2;
                            }
                          }
                        }
                      }
                      
                      // Create match node with actual players
                      const matchToRender: MatchNode = {
                        ...match,
                        player1: actualPlayer1 || match.player1,
                        player2: actualPlayer2 || match.player2,
                        player1IsBye: actualPlayer1IsBye,
                        player2IsBye: actualPlayer2IsBye,
                      };
                      
                      return renderMatchBox(matchToRender);
                    })()}
                  </div>
                );
              })}
              
              {/* SVG overlay for connecting lines with result boxes */}
              {!isLastRound && roundMatches.length > 0 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${BOX_WIDTH}px`, // Start from right edge of boxes
                    width: `${ROUND_GAP + BOX_WIDTH}px`, // Extend to cover gap and next round boxes
                    height: `${calculateRoundHeight(round)}px`,
                    pointerEvents: 'none', // Allow clicks to pass through to match boxes below
                    zIndex: 1, // Behind match boxes so clicks work
                    overflow: 'visible', // Allow lines to extend beyond bounds
                  }}
                >
                  {roundMatches.map((match, matchIndex) => {
                    // Calculate match position
                    const matchTop = calculateMatchTopPosition(round, matchIndex);
                    // Match box center - vertically centered in the match box
                    const matchCenterY = matchTop + MATCH_BOX_HEIGHT / 2;
                    
                    // Each match connects to next round match
                    const nextRoundMatchIndex = Math.floor(matchIndex / 2);
                    const nextRoundMatches = matchesByRound[rounds[roundIndex + 1]] || [];
                    
                    if (nextRoundMatches.length > 0) {
                      // Horizontal segment length before turning (halfway to next round)
                      const horizontalSegmentLength = ROUND_GAP / 2;
                      
                      // Calculate where the next round's match will be
                      const nextRound = round + 1;
                      const nextRoundMatchTop = calculateMatchTopPosition(nextRound, nextRoundMatchIndex);
                      
                      // End at center of match box in next round
                      const nextRoundTargetY = nextRoundMatchTop + MATCH_BOX_HEIGHT / 2;
                      
                      // Calculate meeting point (where lines from matches meet)
                      // Since we have one box per match, the meeting point is the center of the current match box
                      const meetingY = matchCenterY;
                      
                      return (
                        <g key={`line-${match.matchId || matchIndex}`}>
                          {/* Horizontal line from match box center - starts at right edge (x=0), goes right */}
                          <line
                            x1={0}
                            y1={matchCenterY}
                            x2={horizontalSegmentLength}
                            y2={matchCenterY}
                            stroke="#333"
                            strokeWidth="2"
                            pointerEvents="none"
                          />
                          
                          {/* Stepped path continuing to next round */}
                          <g>
                            {/* First horizontal segment: from match center going right */}
                            <line
                              x1={horizontalSegmentLength}
                              y1={meetingY}
                              x2={horizontalSegmentLength + (ROUND_GAP - horizontalSegmentLength) / 2}
                              y2={meetingY}
                              stroke="#333"
                              strokeWidth="2"
                              pointerEvents="none"
                            />
                            {/* Vertical segment: move to align with next round's target position */}
                            <line
                              x1={horizontalSegmentLength + (ROUND_GAP - horizontalSegmentLength) / 2}
                              y1={meetingY}
                              x2={horizontalSegmentLength + (ROUND_GAP - horizontalSegmentLength) / 2}
                              y2={nextRoundTargetY}
                              stroke="#333"
                              strokeWidth="2"
                              pointerEvents="none"
                            />
                            {/* Final horizontal segment: to the left edge (x=0) of the next round's box */}
                            {/* x=ROUND_GAP in SVG coords = left edge of next round (since SVG starts at right edge of current round) */}
                            <line
                              x1={horizontalSegmentLength + (ROUND_GAP - horizontalSegmentLength) / 2}
                              y1={nextRoundTargetY}
                              x2={ROUND_GAP}
                              y2={nextRoundTargetY}
                              stroke="#333"
                              strokeWidth="2"
                              pointerEvents="none"
                            />
                          </g>
                        </g>
                      );
                    }
                    
                    return null;
                  })}
                </svg>
              )}
              
            </div>
          );
        })}
        
      </div>

      {/* Match Edit Dialog */}
      {editingMatch && tournamentId && (() => {
        const player1 = participants.find(p => p.member.id === editingMatch.member1Id);
        const player2 = participants.find(p => p.member.id === editingMatch.member2Id);
        if (!player1 || !player2) return null;
        
        return (
          <MatchEntryPopup
            editingMatch={editingMatch}
            player1={player1.member}
            player2={player2.member}
            tournamentType={tournamentType}
            onSetEditingMatch={setEditingMatch}
            onSave={handleSaveMatch}
            onCancel={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
};
