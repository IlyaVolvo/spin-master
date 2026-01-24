import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  points: number;
  rank: number;
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

      // Determine winner and update points
      const player1Won = (match.player1Sets || 0) > (match.player2Sets || 0);
      const player2Won = (match.player2Sets || 0) > (match.player1Sets || 0);

      if (player1Won && stats1) {
        stats1.wins += 1;
        stats1.points += 2;
      } else if (player2Won && stats2) {
        stats2.wins += 1;
        stats2.points += 2;
      }

      // Handle forfeits
      if (match.player1Forfeit && stats2) {
        stats2.wins += 1;
        stats2.points += 2;
        if (stats1) stats1.losses += 1;
      } else if (match.player2Forfeit && stats1) {
        stats1.wins += 1;
        stats1.points += 2;
        if (stats2) stats2.losses += 1;
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

  if (!isExpanded) {
    return (
      <div className="round-robin-completed collapsed">
        <button onClick={onToggleExpand} className="results-toggle">
          🏆 Show Final Results
        </button>
      </div>
    );
  }

  return (
    <div className="round-robin-completed expanded">
      <div className="results-header">
        <h4>Final Results</h4>
        <button onClick={onToggleExpand} className="results-toggle">
          ▼ Hide Results
        </button>
      </div>

      <div className="results-content">
        {/* Winner announcement */}
        {playerStats.length > 0 && (
          <div className="winner-announcement">
            <div className="winner-medal">🥇</div>
            <div className="winner-info">
              <h5>Champion</h5>
              <p className="winner-name">{getPlayerName(playerStats[0].memberId)}</p>
              <p className="winner-stats">
                {playerStats[0].wins}W - {playerStats[0].losses}L, {playerStats[0].points} points
              </p>
            </div>
          </div>
        )}

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
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((stats) => {
                const participant = tournament.participants.find(p => p.memberId === stats.memberId);
                return (
                  <tr key={stats.memberId} className={stats.rank <= 3 ? `rank-${stats.rank}` : ''}>
                    <td className="rank-cell">
                      {stats.rank === 1 && '🥇'}
                      {stats.rank === 2 && '🥈'}
                      {stats.rank === 3 && '🥉'}
                      {stats.rank > 3 && stats.rank}
                    </td>
                    <td className="player-name">
                      {formatPlayerName(
                        participant?.member.firstName || '',
                        participant?.member.lastName || '',
                        getNameDisplayOrder()
                      )}
                    </td>
                    <td>{stats.wins}</td>
                    <td>{stats.losses}</td>
                    <td>{stats.setsWon}</td>
                    <td>{stats.setsLost}</td>
                    <td className="points-cell"><strong>{stats.points}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tournament summary */}
        <div className="tournament-summary">
          <h5>Tournament Summary</h5>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">Participants:</span>
              <span className="stat-value">{tournament.participants.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Matches:</span>
              <span className="stat-value">{tournament.matches.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Completed:</span>
              <span className="stat-value">
                {tournament.matches.filter(m => 
                  (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
                ).length}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Date:</span>
              <span className="stat-value">
                {tournament.recordedAt 
                  ? new Date(tournament.recordedAt).toLocaleDateString()
                  : new Date(tournament.createdAt).toLocaleDateString()
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
