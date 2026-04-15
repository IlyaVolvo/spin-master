import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { isLikelyRanking } from '../../../utils/ratingFormatter';
import { sortParticipantsByRating } from '../utils/participantSort';

interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  points: number;
  rank: number;
}

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
}

interface Match {
  id: number;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

const buildResultsMatrix = (tournament: any) => {
  const participants = sortParticipantsByRating(tournament.participants);
  const participantData = participants; // Keep participant data for ratings
  const matrix: { [key: number]: { [key: number]: string } } = {};
  const matchMap: { [key: string]: Match } = {}; // Store match data for editing
  
  // Initialize matrix
  participants.forEach((p1: any) => {
    matrix[p1.member.id] = {};
    participants.forEach((p2: any) => {
      if (p1.member.id === p2.member.id) {
        matrix[p1.member.id][p2.member.id] = '-';
      } else {
        matrix[p1.member.id][p2.member.id] = '';
      }
    });
  });

  // Fill in match results
  tournament.matches.forEach((match: Match) => {
    if (match.member2Id === null) return; // Skip BYE matches
    
    let score1: string;
    let score2: string;
    
    // Handle forfeit matches
    if (match.player1Forfeit) {
      score1 = 'L';
      score2 = 'W';
    } else if (match.player2Forfeit) {
      score1 = 'W';
      score2 = 'L';
    } else {
      // Regular match with scores
      score1 = `${match.player1Sets} - ${match.player2Sets}`;
      score2 = `${match.player2Sets} - ${match.player1Sets}`;
    }
    
    matrix[match.member1Id][match.member2Id] = score1;
    // Reverse for the other direction (shows who won)
    matrix[match.member2Id][match.member1Id] = score2;
    
    // Store match for editing (both directions)
    matchMap[`${match.member1Id}-${match.member2Id}`] = match;
    matchMap[`${match.member2Id}-${match.member1Id}`] = match;
  });

  return { participants, participantData, matrix, matchMap };
};

/** e.g. +20, -10 */
function formatSignedDelta(n: number): string {
  if (n >= 0) return `+${n}`;
  return `${n}`;
}

/**
 * (current) (signup/(completion Δ[, during Δ][, after Δ]))
 * - completion Δ: TOURNAMENT_COMPLETED ratingChange (final RR adjustment).
 * - during Δ: optional; rating change from signup to anchor immediately before that completion
 *   (e.g. rated matches during the event). anchor = rrCompletionRating − completion Δ.
 * - after Δ: optional; current − materialized rating after tournament if profile moved later.
 */
function formatRrCompletedRatingLine(participant: any): string | null {
  const before = participant?.playerRatingAtTime;
  const current = participant?.postRatingAtTime ?? participant?.member?.rating ?? null;
  if (before == null || current == null || isLikelyRanking(before)) {
    return null;
  }
  const cur = Math.round(current);
  const bef = Math.round(before);

  const tcChange = participant?.rrCompletionRatingChange;
  const rAfterTournament = participant?.rrCompletionRating;

  if (rAfterTournament != null) {
    const rEvent = Math.round(rAfterTournament);
    const completionDelta =
      tcChange != null ? Math.round(tcChange) : rEvent - bef;

    const parts: string[] = [formatSignedDelta(completionDelta)];

    if (tcChange != null) {
      const anchorBeforeCompletion = rEvent - Math.round(tcChange);
      const duringDelta = anchorBeforeCompletion - bef;
      if (duringDelta !== 0) {
        parts.push(formatSignedDelta(duringDelta));
      }
    }

    const afterDelta = cur - rEvent;
    if (afterDelta !== 0) {
      parts.push(formatSignedDelta(afterDelta));
    }

    const innerDeltas = parts.join(', ');
    return `(${cur}) (${bef}/(${innerDeltas}))`;
  }

  const net = cur - bef;
  return `(${cur}) (${bef}/(${formatSignedDelta(net)}))`;
}

export const RoundRobinCompletedPanel: React.FC<TournamentCompletedProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const playerStats = React.useMemo(() => {
    const statsMap = new Map<number, PlayerStats>();
    
    // Initialize stats for all participants
    tournament.participants.forEach(p => {
      statsMap.set(p.memberId, {
        memberId: p.memberId,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        points: 0,
        rank: 0
      });
    });

    // Calculate stats from matches
    tournament.matches.forEach(match => {
      const stats1 = statsMap.get(match.member1Id);
      const stats2 = match.member2Id ? statsMap.get(match.member2Id) : null;

      if (stats1) {
        stats1.setsWon += match.player1Sets || 0;
        stats1.setsLost += match.player2Sets || 0;
      }

      if (stats2) {
        stats2.setsWon += match.player2Sets || 0;
        stats2.setsLost += match.player1Sets || 0;
      }

      // Handle forfeits first
      if (match.player1Forfeit && stats2) {
        stats2.wins += 1;
        stats2.points += 2;
        if (stats1) stats1.losses += 1;
      } else if (match.player2Forfeit && stats1) {
        stats1.wins += 1;
        stats1.points += 2;
        if (stats2) stats2.losses += 1;
      } else {
        // Determine winner and update wins/losses for regular matches
        const player1Won = (match.player1Sets || 0) > (match.player2Sets || 0);
        const player2Won = (match.player2Sets || 0) > (match.player1Sets || 0);

        if (player1Won && stats1) {
          stats1.wins += 1;
          stats1.points += 2;
          if (stats2) stats2.losses += 1;
        } else if (player2Won && stats2) {
          stats2.wins += 1;
          stats2.points += 2;
          if (stats1) stats1.losses += 1;
        }
      }
    });

    // Sort and assign ranks
    const sortedStats = Array.from(statsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const setDiff1 = a.setsWon - a.setsLost;
      const setDiff2 = b.setsWon - b.setsLost;
      if (setDiff2 !== setDiff1) return setDiff2 - setDiff1;
      return b.setsWon - a.setsWon;
    });

    // Assign ranks
    sortedStats.forEach((stats, index) => {
      stats.rank = index + 1;
    });

    return sortedStats;
  }, [tournament.participants, tournament.matches]);

  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Generate results matrix for display
  const { participants, participantData, matrix } = React.useMemo(() => {
    return buildResultsMatrix(tournament);
  }, [tournament]);

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="round-robin-completed expanded">
      <div className="results-content">
        {/* Final standings table */}
        <div className="final-standings">
          <h5>Final Standings</h5>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Sets Won</th>
                <th>Sets Lost</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((stats) => {
                const participant = tournament.participants.find(p => p.memberId === stats.memberId);
                const ratingLine = participant ? formatRrCompletedRatingLine(participant) : null;
                return (
                  <tr key={stats.memberId} className={stats.rank <= 3 ? `rank-${stats.rank}` : ''}>
                    <td className="rank-cell">
                      {stats.rank === 1 && '🥇'}
                      {stats.rank === 2 && '🥈'}
                      {stats.rank === 3 && '🥉'}
                      {stats.rank > 3 && stats.rank}
                    </td>
                    <td className="player-name" style={{ whiteSpace: 'nowrap' }}>
                      {formatPlayerName(
                        participant?.member.firstName || '',
                        participant?.member.lastName || '',
                        getNameDisplayOrder()
                      )}
                      {ratingLine && (
                        <span style={{
                          marginLeft: '6px',
                          fontSize: '11px',
                          color: '#444',
                          fontWeight: 'normal',
                        }}>
                          {ratingLine}
                        </span>
                      )}
                    </td>
                    <td>{stats.wins}</td>
                    <td>{stats.losses}</td>
                    <td>{stats.setsWon}</td>
                    <td>{stats.setsLost}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#666', maxWidth: '720px' }}>
            Rating: (current) (at signup / (adjustment when this RR completed; optional change from
            rated play during the event before that step; optional change after if your profile moved)).
          </p>
        </div>

        {/* Results Matrix */}
        <div style={{ marginBottom: '20px', display: 'inline-block' }}>
          <h5 style={{ marginBottom: '15px' }}>Results Matrix</h5>
          <div style={{ marginBottom: '20px', display: 'inline-block' }}>
            <table 
              style={{ 
                borderCollapse: 'collapse', 
                fontSize: '12px', 
                backgroundColor: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <thead>
                <tr>
                  <th style={{ 
                    padding: '8px 12px', 
                    backgroundColor: '#2c3e50', 
                    color: 'white', 
                    fontWeight: 'bold',
                    textAlign: 'center',
                    border: '1px solid #34495e'
                  }}>
                    VS
                  </th>
                  {participantData.map((p: any) => (
                    <th 
                      key={p.member.id} 
                      style={{ 
                        padding: '8px 12px', 
                        backgroundColor: '#2c3e50', 
                        color: 'white', 
                        fontWeight: 'bold',
                        textAlign: 'center',
                        border: '1px solid #34495e',
                        minWidth: '80px'
                      }}
                    >
                      {formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participantData.map((p1: any) => (
                  <tr key={p1.member.id}>
                    <td 
                      style={{ 
                        padding: '8px 12px', 
                        backgroundColor: '#2c3e50', 
                        color: 'white', 
                        fontWeight: 'bold',
                        textAlign: 'center',
                        border: '1px solid #34495e'
                      }}
                    >
                      {formatPlayerName(p1.member.firstName, p1.member.lastName, getNameDisplayOrder())}
                      <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.8, marginLeft: '4px' }}>({p1.playerRatingAtTime ?? p1.member.rating ?? '—'})</span>
                    </td>
                    {participantData.map((p2: any) => {
                      const cellValue = matrix[p1.member.id][p2.member.id];
                      const isDraw = cellValue === '-';
                      const isEmpty = cellValue === '';
                      // Detect win/loss: forfeit 'W'/'L' or numeric score where left > right
                      let isWin = false;
                      let isLoss = false;
                      if (cellValue === 'W') {
                        isWin = true;
                      } else if (cellValue === 'L') {
                        isLoss = true;
                      } else if (!isDraw && !isEmpty && cellValue.includes(' - ')) {
                        const parts = cellValue.split(' - ');
                        const left = parseInt(parts[0]);
                        const right = parseInt(parts[1]);
                        if (!isNaN(left) && !isNaN(right)) {
                          isWin = left > right;
                          isLoss = right > left;
                        }
                      }
                      
                      return (
                        <td 
                          key={p2.member.id}
                          style={{ 
                            padding: '8px 12px', 
                            textAlign: 'center',
                            border: '1px solid #ddd',
                            backgroundColor: isWin ? '#d4edda' : isLoss ? '#f8d7da' : isDraw ? '#e9ecef' : 'white',
                            fontWeight: isWin || isLoss ? 'bold' : 'normal',
                            color: isWin ? '#155724' : isLoss ? '#721c24' : '#333',
                            minWidth: '80px'
                          }}
                        >
                          {cellValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            Green cells indicate wins for the row player, red cells indicate losses. Diagonal shows player names.
          </p>
        </div>

      </div>
    </div>
  );
};
