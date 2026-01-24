import React, { useState, useMemo } from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import './SwissActivePanel.css';

interface SwissPlayerStats {
  memberId: number;
  memberName: string;
  points: number;
  roundsPlayed: number;
  wins: number;
  losses: number;
  rating: number | null;
  opponents: Set<number>;
}

interface SwissRound {
  roundNumber: number;
  matches: Array<{
    id: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    completed: boolean;
  }>;
}

export const SwissActivePanel: React.FC<TournamentActiveProps> = ({
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
  const [currentRound, setCurrentRound] = useState(1);

  // Calculate player statistics
  const playerStats = useMemo(() => {
    const statsMap = new Map<number, SwissPlayerStats>();
    
    // Initialize stats for all participants
    tournament.participants.forEach(p => {
      statsMap.set(p.memberId, {
        memberId: p.memberId,
        memberName: formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder()),
        points: 0,
        roundsPlayed: 0,
        wins: 0,
        losses: 0,
        rating: p.playerRatingAtTime,
        opponents: new Set()
      });
    });

    // Calculate stats from matches
    tournament.matches.forEach(match => {
      const stats1 = statsMap.get(match.member1Id);
      const stats2 = match.member2Id ? statsMap.get(match.member2Id) : null;

      if (stats1 && stats2) {
        stats1.opponents.add(match.member2Id || 0);
        stats2.opponents.add(match.member1Id || 0);
      }

      // Determine winner and update points
      const player1Won = (match.player1Sets || 0) > (match.player2Sets || 0);
      const player2Won = (match.player2Sets || 0) > (match.player1Sets || 0);

      if (player1Won && stats1) {
        stats1.wins += 1;
        stats1.points += 1;
        stats1.roundsPlayed += 1;
      } else if (player2Won && stats2) {
        stats2.wins += 1;
        stats2.points += 1;
        stats2.roundsPlayed += 1;
      }

      // Handle forfeits
      if (match.player1Forfeit && stats2) {
        stats2.wins += 1;
        stats2.points += 1;
        stats2.roundsPlayed += 1;
        if (stats1) {
          stats1.losses += 1;
          stats1.roundsPlayed += 1;
        }
      } else if (match.player2Forfeit && stats1) {
        stats1.wins += 1;
        stats1.points += 1;
        stats1.roundsPlayed += 1;
        if (stats2) {
          stats2.losses += 1;
          stats2.roundsPlayed += 1;
        }
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => {
      // Sort by points (descending), then rating (descending)
      if (b.points !== a.points) return b.points - a.points;
      if (b.rating !== a.rating) return (b.rating || 0) - (a.rating || 0);
      return a.memberName.localeCompare(b.memberName);
    });
  }, [tournament.participants, tournament.matches]);

  // Organize matches by rounds
  const rounds = useMemo(() => {
    const roundsMap = new Map<number, SwissRound>();
    
    tournament.matches.forEach(match => {
      const round = match.round || 1;
      if (!roundsMap.has(round)) {
        roundsMap.set(round, {
          roundNumber: round,
          matches: []
        });
      }
      
      roundsMap.get(round)!.matches.push({
        id: match.id,
        member1Id: match.member1Id,
        member2Id: match.member2Id || 0,
        player1Sets: match.player1Sets,
        player2Sets: match.player2Sets,
        player1Forfeit: match.player1Forfeit || false,
        player2Forfeit: match.player2Forfeit || false,
        completed: (match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || (match.player2Forfeit || false))
      });
    });

    return Array.from(roundsMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [tournament.matches]);

  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

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

  const handleGenerateNextRound = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/swiss/next-round`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate next round');
      }

      const updatedTournament = await response.json();
      onTournamentUpdate(updatedTournament);
      onSuccess('Next round generated successfully');
    } catch (error) {
      onError('Failed to generate next round');
    }
  };

  const currentRoundData = rounds.find(r => r.roundNumber === currentRound) || { roundNumber: currentRound, matches: [] };
  const isCurrentRoundComplete = currentRoundData.matches.length > 0 && currentRoundData.matches.every(m => m.completed);
  const canGenerateNextRound = isCurrentRoundComplete && currentRound < rounds.length;

  return (
    <div className="swiss-active">
      {/* Tournament Header */}
      <div className="swiss-active__header">
        <h4>{tournament.name || 'Swiss Tournament'}</h4>
        <div className="tournament-info">
          <span className="info-badge">
            Round {currentRound} of {rounds.length}
          </span>
          <span className="info-badge">
            {tournament.participants.length} Players
          </span>
        </div>
      </div>

      {/* Current Standings */}
      <div className="swiss-active__section">
        <h4>Current Standings</h4>
        <div className="standings-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>W-L</th>
                <th>Rating</th>
                <th>Opponents</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((stats, index) => (
                <tr key={stats.memberId}>
                  <td>{index + 1}</td>
                  <td className="player-name">{stats.memberName}</td>
                  <td className="points"><strong>{stats.points}</strong></td>
                  <td>{stats.wins}-{stats.losses}</td>
                  <td>{stats.rating || '-'}</td>
                  <td className="opponents">
                    {Array.from(stats.opponents).map(opponentId => getPlayerName(opponentId)).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Round Navigation */}
      <div className="swiss-active__section">
        <div className="round-navigation">
          <h4>Round Matches</h4>
          <div className="round-selector">
            {rounds.map(round => (
              <button
                key={round.roundNumber}
                className={`round-tab ${currentRound === round.roundNumber ? 'active' : ''}`}
                onClick={() => setCurrentRound(round.roundNumber)}
              >
                Round {round.roundNumber}
                {round.matches.every(m => m.completed) && ' ✓'}
              </button>
            ))}
            {canGenerateNextRound && (
              <button
                className="round-tab generate-next"
                onClick={handleGenerateNextRound}
              >
                + Generate Round {currentRound + 1}
              </button>
            )}
          </div>
        </div>

        {/* Current Round Matches */}
        <div className="round-matches">
          {currentRoundData.matches.length > 0 ? (
            currentRoundData.matches.map(match => (
              <div key={match.id} className={`match-item ${match.completed ? 'completed' : 'pending'}`}>
                <div className="match-players">
                  <span className="player-name">{getPlayerName(match.member1Id)}</span>
                  <span className="vs">vs</span>
                  <span className="player-name">{getPlayerName(match.member2Id)}</span>
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
                      {match.completed ? (
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
                      {match.completed ? 'Edit' : 'Enter Score'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="no-matches">
              <p>No matches generated for this round yet.</p>
              {currentRound === 1 && (
                <button onClick={handleGenerateNextRound} className="generate-first-round">
                  Generate First Round
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
