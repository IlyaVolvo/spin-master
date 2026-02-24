import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { sortParticipantsByRating } from '../utils/participantSort';

// Types for schedule generation
interface ScheduleMatch {
  matchNumber: number;
  round: number;
  player1Id: number;
  player1Name: string;
  player1StoredRating: number | null;
  player1CurrentRating: number | null;
  player1RatingDisplay: string;
  player2Id: number;
  player2Name: string;
  player2StoredRating: number | null;
  player2CurrentRating: number | null;
  player2RatingDisplay: string;
}

interface ScheduleRound {
  round: number;
  matches: ScheduleMatch[];
}

const formatActiveTournamentRating = (storedRating: number | null, currentRating: number | null) => {
  if (storedRating === null || currentRating === null) return '';
  if (storedRating === currentRating) return currentRating.toString();
  return `${storedRating}→${currentRating}`;
};

const generateRoundRobinSchedule = (tournament: any): ScheduleRound[] => {
  if (tournament.type !== 'ROUND_ROBIN') {
    return [];
  }

  const participants = sortParticipantsByRating(tournament.participants);
  const n = participants.length;
  
  if (n < 2) {
    return [];
  }

  // First, generate all unique pairs to ensure completeness
  const allPairs = new Map<string, { player1Index: number; player2Index: number }>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const key = `${i}-${j}`;
      allPairs.set(key, { player1Index: i, player2Index: j });
    }
  }

  // Verify we have the correct number of pairs: n*(n-1)/2
  const expectedPairs = (n * (n - 1)) / 2;
  if (allPairs.size !== expectedPairs) {
    // Schedule generation error: Expected pairs mismatch
  }

  const rounds: ScheduleRound[] = [];
  const usedPairs = new Set<string>();
  const playerMatchCounts = new Map<number, number>(); // Track how many matches each player has been scheduled
  let matchNumber = 1;
  let roundNumber = 1;

  // Initialize match counts
  for (let i = 0; i < n; i++) {
    playerMatchCounts.set(i, 0);
  }

  // Organize pairs into rounds with fair distribution
  while (usedPairs.size < allPairs.size) {
    const roundMatches: ScheduleMatch[] = [];
    const playersInRound = new Set<number>();

    // Get all available pairs (not yet used and players not in current round)
    const availablePairs: Array<{ key: string; pair: { player1Index: number; player2Index: number }; priority: number }> = [];
    
    // Find min and max match counts to ensure fair distribution
    const matchCounts = Array.from(playerMatchCounts.values());
    const minCount = Math.min(...matchCounts);
    const maxCount = Math.max(...matchCounts);
    
    for (const [key, pair] of allPairs.entries()) {
      if (usedPairs.has(key)) continue;
      if (playersInRound.has(pair.player1Index) || playersInRound.has(pair.player2Index)) continue;

      const count1 = playerMatchCounts.get(pair.player1Index) || 0;
      const count2 = playerMatchCounts.get(pair.player2Index) || 0;
      
      // Priority calculation:
      // 1. Prefer pairs where both players have the minimum count (most fair)
      // 2. Avoid pairs that would create a difference > 1
      // 3. Lower sum is better
      let priority = count1 + count2;
      
      // Boost priority if both players are at minimum count
      if (count1 === minCount && count2 === minCount) {
        priority -= 1000; // High priority
      }
      
      // Penalize if adding this match would create unfair distribution
      // (maxCount - minCount should stay <= 1)
      if (count1 === maxCount || count2 === maxCount) {
        if (maxCount - minCount >= 1) {
          priority += 1000; // Lower priority - would create unfair distribution
        }
      }

      availablePairs.push({ key, pair, priority });
    }

    // Sort by priority (lower is better) to ensure fair distribution
    availablePairs.sort((a, b) => a.priority - b.priority);

    // Add matches to this round, ensuring no player appears twice
    for (const { key, pair } of availablePairs) {
      // Double-check players aren't already in this round (might have changed during iteration)
      if (playersInRound.has(pair.player1Index) || playersInRound.has(pair.player2Index)) {
        continue;
      }

      const participant1 = participants[pair.player1Index];
      const participant2 = participants[pair.player2Index];
      const member1 = participant1.member;
      const member2 = participant2.member;

      roundMatches.push({
        matchNumber: matchNumber++,
        round: roundNumber,
        player1Id: member1.id,
        player1Name: formatPlayerName(member1.firstName, member1.lastName, getNameDisplayOrder()),
        player1StoredRating: participant1.playerRatingAtTime,
        player1CurrentRating: member1.rating ?? null,
        player1RatingDisplay: formatActiveTournamentRating(participant1.playerRatingAtTime, member1.rating),
        player2Id: member2.id,
        player2Name: formatPlayerName(member2.firstName, member2.lastName, getNameDisplayOrder()),
        player2StoredRating: participant2.playerRatingAtTime,
        player2CurrentRating: member2.rating ?? null,
        player2RatingDisplay: formatActiveTournamentRating(participant2.playerRatingAtTime, member2.rating),
      });

      // Mark this pair as used, mark players as in this round, and increment match counts
      usedPairs.add(key);
      playersInRound.add(pair.player1Index);
      playersInRound.add(pair.player2Index);
      playerMatchCounts.set(pair.player1Index, (playerMatchCounts.get(pair.player1Index) || 0) + 1);
      playerMatchCounts.set(pair.player2Index, (playerMatchCounts.get(pair.player2Index) || 0) + 1);
    }

    if (roundMatches.length > 0) {
      rounds.push({
        round: roundNumber,
        matches: roundMatches,
      });
      roundNumber++;
    } else {
      // If we can't add any more matches but haven't used all pairs, there's a problem
      break;
    }
  }

  // Verify all pairs were used
  if (usedPairs.size !== allPairs.size) {
    // Schedule generation warning: Not all pairs were used
  }

  return rounds;
};

export const RoundRobinSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  // Generate proper Round Robin schedule
  const scheduleRounds = React.useMemo(() => {
    return generateRoundRobinSchedule(tournament);
  }, [tournament]);

  // Create a set of played matches for quick lookup
  const playedMatches = React.useMemo(() => {
    const played = new Set<string>();
    tournament.matches.forEach(match => {
      if (match.member2Id !== null && match.member2Id !== 0) {
        const key1 = `${match.member1Id}-${match.member2Id}`;
        const key2 = `${match.member2Id}-${match.member1Id}`;
        played.add(key1);
        played.add(key2);
      }
    });
    return played;
  }, [tournament.matches]);

  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  const formatActiveTournamentRating = (storedRating: number | null, currentRating: number | null) => {
    if (storedRating === null || currentRating === null) return '';
    if (storedRating === currentRating) return currentRating.toString();
    return `${storedRating}→${currentRating}`;
  };

  if (!isExpanded) {
    return (
      <div className="round-robin-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Schedule ({scheduleRounds.length} rounds)
        </button>
      </div>
    );
  }

  return (
    <div className="round-robin-schedule expanded">
      <div className="schedule-header">
        <h4>Match Schedule</h4>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
          All pairs ready to play, organized by round.
        </p>
        <button onClick={onToggleExpand} className="schedule-toggle">
          ▼ Hide Schedule
        </button>
      </div>

      <div className="schedule-content">
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#e9ecef' }}>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', width: '80px' }}>Match #</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Player 1</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Player 2</th>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: '0', border: 'none', height: '2px', backgroundColor: '#333' }}></td>
            </tr>
          </thead>
          <tbody>
            {scheduleRounds.map((round, roundIndex) => (
              <React.Fragment key={round.round}>
                {roundIndex > 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '0', border: 'none', height: '3px', backgroundColor: '#333' }}></td>
                  </tr>
                )}
                {round.matches.map((match, matchIndex) => {
                  const matchKey = `${match.player1Id}-${match.player2Id}`;
                  const isPlayed = playedMatches.has(matchKey);
                  
                  return (
                    <tr key={`${round.round}-${matchIndex}`} style={isPlayed ? { textDecoration: 'line-through', color: '#aaa' } : {}}>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                        {match.matchNumber}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {match.player1Name}
                        {match.player1RatingDisplay && (
                          <span style={{ fontSize: '12px', color: isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({match.player1RatingDisplay})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {match.player2Name}
                        {match.player2RatingDisplay && (
                          <span style={{ fontSize: '12px', color: isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({match.player2RatingDisplay})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
