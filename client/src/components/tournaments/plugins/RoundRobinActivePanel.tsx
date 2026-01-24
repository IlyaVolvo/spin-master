import React, { useState, useMemo } from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import './RoundRobinActivePanel.css';

interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  points: number; // Round Robin points (2 for win, 1 for loss)
}

export const RoundRobinActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const [editingMatch, setEditingMatch] = useState<number | null>(null);
  const [matchScores, setMatchScores] = useState<{[key: number]: {
    player1Sets: string;
    player2Sets: string;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
  }}>({});

  // Calculate player statistics
  const playerStats = useMemo(() => {
    const statsMap = new Map<number, PlayerStats>();
    
    // Initialize stats for all participants
    tournament.participants.forEach(p => {
      statsMap.set(p.memberId, {
        memberId: p.memberId,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        points: 0
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

    return Array.from(statsMap.values()).sort((a, b) => {
      // Sort by points, then sets difference, then sets won
      if (b.points !== a.points) return b.points - a.points;
      const setDiff1 = a.setsWon - a.setsLost;
      const setDiff2 = b.setsWon - b.setsLost;
      if (setDiff2 !== setDiff1) return setDiff2 - setDiff1;
      return b.setsWon - a.setsWon;
    });
  }, [tournament.participants, tournament.matches]);

  const handleMatchEdit = (matchId: number) => {
    const match = tournament.matches.find(m => m.id === matchId);
    if (match) {
      setMatchScores(prev => ({
        ...prev,
        [matchId]: {
          player1Sets: match.player1Sets.toString(),
          player2Sets: match.player2Sets.toString(),
          player1Forfeit: match.player1Forfeit || false,
          player2Forfeit: match.player2Forfeit || false,
        }
      }));
      setEditingMatch(matchId);
    }
  };

  const handleMatchSave = async (matchId: number) => {
    const scores = matchScores[matchId];
    if (!scores) return;

    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player1Sets: parseInt(scores.player1Sets) || 0,
          player2Sets: parseInt(scores.player2Sets) || 0,
          player1Forfeit: scores.player1Forfeit,
          player2Forfeit: scores.player2Forfeit,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update match');
      }

      const updatedMatch = await response.json();
      onMatchUpdate(updatedMatch);
      setEditingMatch(null);
      onSuccess('Match updated successfully');
    } catch (error) {
      onError('Failed to update match');
    }
  };

  const handleMatchCancel = (matchId: number) => {
    setEditingMatch(null);
    delete matchScores[matchId];
  };

  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  const isMatchComplete = (match: any) => {
    return (match.player1Sets > 0 || match.player2Sets > 0) || 
           match.player1Forfeit || 
           match.player2Forfeit;
  };

  return (
    <div className="round-robin-active">
      {/* Standings */}
      <div className="round-robin-active__section">
        <h4>Current Standings</h4>
        <div className="standings-table">
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
              {playerStats.map((stats, index) => {
                const participant = tournament.participants.find(p => p.memberId === stats.memberId);
                return (
                  <tr key={stats.memberId}>
                    <td>{index + 1}</td>
                    <td>
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
                    <td><strong>{stats.points}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matches */}
      <div className="round-robin-active__section">
        <h4>Matches</h4>
        <div className="matches-list">
          {tournament.matches.map(match => (
            <div key={match.id} className={`match-item ${isMatchComplete(match) ? 'completed' : 'pending'}`}>
              <div className="match-players">
                <span className="player-name">{getPlayerName(match.member1Id)}</span>
                <span className="vs">vs</span>
                <span className="player-name">
                  {match.member2Id ? getPlayerName(match.member2Id) : 'BYE'}
                </span>
              </div>

              {editingMatch === match.id ? (
                <div className="match-edit">
                  <div className="score-inputs">
                    <input
                      type="number"
                      min="0"
                      value={matchScores[match.id]?.player1Sets || ''}
                      onChange={(e) => setMatchScores(prev => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], player1Sets: e.target.value }
                      }))}
                      placeholder="Sets"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min="0"
                      value={matchScores[match.id]?.player2Sets || ''}
                      onChange={(e) => setMatchScores(prev => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], player2Sets: e.target.value }
                      }))}
                      placeholder="Sets"
                    />
                  </div>
                  <div className="forfeit-checkboxes">
                    <label>
                      <input
                        type="checkbox"
                        checked={matchScores[match.id]?.player1Forfeit || false}
                        onChange={(e) => setMatchScores(prev => ({
                          ...prev,
                          [match.id]: { ...prev[match.id], player1Forfeit: e.target.checked }
                        }))}
                      />
                      P1 Forfeit
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={matchScores[match.id]?.player2Forfeit || false}
                        onChange={(e) => setMatchScores(prev => ({
                          ...prev,
                          [match.id]: { ...prev[match.id], player2Forfeit: e.target.checked }
                        }))}
                      />
                      P2 Forfeit
                    </label>
                  </div>
                  <div className="match-actions">
                    <button onClick={() => handleMatchSave(match.id)} className="save-button">
                      Save
                    </button>
                    <button onClick={() => handleMatchCancel(match.id)} className="cancel-button">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="match-display">
                  <div className="match-score">
                    {isMatchComplete(match) ? (
                      <>
                        <span className="score">{match.player1Sets}</span>
                        <span>-</span>
                        <span className="score">{match.player2Sets}</span>
                        {match.player1Forfeit && <span className="forfeit">P1 Forfeit</span>}
                        {match.player2Forfeit && <span className="forfeit">P2 Forfeit</span>}
                      </>
                    ) : (
                      <span className="pending">Pending</span>
                    )}
                  </div>
                  <button 
                    onClick={() => handleMatchEdit(match.id)}
                    className="edit-button"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
