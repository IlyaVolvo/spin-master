import React, { useState, useMemo } from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import './PlayoffActivePanel.css';

export const PlayoffActivePanel: React.FC<TournamentActiveProps> = ({
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

  // Organize bracket matches by round
  const bracketByRound = useMemo(() => {
    if (!tournament.bracketMatches) return {};

    const rounds: { [round: number]: typeof tournament.bracketMatches } = {};
    
    tournament.bracketMatches.forEach(bracketMatch => {
      if (!rounds[bracketMatch.round]) {
        rounds[bracketMatch.round] = [];
      }
      rounds[bracketMatch.round].push(bracketMatch);
    });

    // Sort matches within each round by position
    Object.keys(rounds).forEach(round => {
      rounds[parseInt(round)].sort((a, b) => a.position - b.position);
    });

    return rounds;
  }, [tournament.bracketMatches]);

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

  const isMatchComplete = (match: any) => {
    return (match.player1Sets > 0 || match.player2Sets > 0) || 
           match.player1Forfeit || 
           match.player2Forfeit;
  };

  const getMatchWinner = (match: any) => {
    if (match.player1Forfeit) return match.member2Id;
    if (match.player2Forfeit) return match.member1Id;
    
    const player1Sets = match.player1Sets || 0;
    const player2Sets = match.player2Sets || 0;
    
    if (player1Sets > player2Sets) return match.member1Id;
    if (player2Sets > player1Sets) return match.member2Id;
    
    return null;
  };

  const getRoundName = (round: number) => {
    const totalRounds = Object.keys(bracketByRound).length;
    if (round === totalRounds) return 'Finals';
    if (round === totalRounds - 1) return 'Semifinals';
    if (round === totalRounds - 2) return 'Quarterfinals';
    return `Round ${round}`;
  };

  return (
    <div className="playoff-active">
      {/* Tournament Info */}
      <div className="playoff-active__header">
        <h4>{tournament.name || 'Playoff Tournament'}</h4>
        <div className="tournament-info">
          <span className="info-badge">
            {tournament.bracketMatches?.length || 0} Bracket Positions
          </span>
          <span className="info-badge">
            {tournament.participants.length} Participants
          </span>
        </div>
      </div>

      {/* Bracket Display */}
      <div className="playoff-bracket">
        {Object.entries(bracketByRound)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([round, matches]) => (
            <div key={round} className="bracket-round">
              <h5>{getRoundName(parseInt(round))}</h5>
              <div className="round-matches">
                {matches.map(bracketMatch => {
                  const match = bracketMatch.match;
                  const isComplete = match && isMatchComplete(match);
                  const winnerId = match ? getMatchWinner(match) : null;

                  return (
                    <div key={bracketMatch.id} className="bracket-match">
                      <div className="match-players">
                        <div className={`player ${winnerId === bracketMatch.member1Id ? 'winner' : ''} ${isComplete ? 'completed' : ''}`}>
                          <span className="player-name">
                            {bracketMatch.member1Id ? getPlayerName(bracketMatch.member1Id) : 'TBD'}
                          </span>
                          {match && (
                            <span className="player-score">{match.player1Sets}</span>
                          )}
                        </div>
                        
                        <div className="vs">VS</div>
                        
                        <div className={`player ${winnerId === bracketMatch.member2Id ? 'winner' : ''} ${isComplete ? 'completed' : ''}`}>
                          <span className="player-name">
                            {bracketMatch.member2Id ? getPlayerName(bracketMatch.member2Id) : 'TBD'}
                          </span>
                          {match && (
                            <span className="player-score">{match.player2Sets}</span>
                          )}
                        </div>
                      </div>

                      {match && (
                        <div className="match-actions">
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
                              <div className="edit-actions">
                                <button onClick={() => handleMatchSave(match.id)} className="save-button">
                                  Save
                                </button>
                                <button onClick={() => handleMatchCancel(match.id)} className="cancel-button">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleMatchEdit(match.id)}
                              className="edit-button"
                              disabled={!bracketMatch.member1Id || !bracketMatch.member2Id}
                            >
                              {isComplete ? 'Edit' : 'Enter Score'}
                            </button>
                          )}
                        </div>
                      )}

                      {isComplete && winnerId && (
                        <div className="match-winner">
                          Winner: {getPlayerName(winnerId)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
