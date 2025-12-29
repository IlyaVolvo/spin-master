import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';

interface MatchHistory {
  id: number;
  tournamentId: number;
  tournamentName: string | null;
  tournamentStatus: string;
  tournamentType?: 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH';
  tournamentDate: string;
  opponentId: number;
  opponentName: string;
  memberSets: number;
  opponentSets: number;
  memberForfeit: boolean;
  opponentForfeit: boolean;
  matchDate: string;
  memberRatingAfter: number | null;
  memberRatingChange: number | null;
  opponentRatingAfter: number | null;
  opponentRatingChange: number | null;
}

interface MatchHistoryResponse {
  member: {
    id: number;
    firstName: string;
    lastName: string;
  };
  opponents: Array<{
    id: number;
    firstName: string;
    lastName: string;
  }>;
  matches: MatchHistory[];
}

interface RatingHistoryPoint {
  date: string;
  rating: number | null;
  tournamentId: number | null;
  tournamentName: string | null;
  matchId: number | null;
}

interface PlayerRatingHistory {
  memberId: number;
  firstName: string;
  lastName: string;
  history: RatingHistoryPoint[];
}

const History: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [opponentIds, setOpponentIds] = useState<number[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryResponse | null>(null);
  const [ratingHistory, setRatingHistory] = useState<PlayerRatingHistory[]>([]);
  const [playerInfo, setPlayerInfo] = useState<{ id: number; firstName: string; lastName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const playerIdFromState = location.state?.playerId as number | undefined;
    const opponentIdsFromState = location.state?.opponentIds as number[] | undefined;
    
    if (playerIdFromState) {
      setPlayerId(playerIdFromState);
      
      if (opponentIdsFromState && opponentIdsFromState.length > 0) {
      setOpponentIds(opponentIdsFromState);
        setMatchHistory(null);
        setRatingHistory([]);
      fetchMatchHistory(playerIdFromState, opponentIdsFromState);
      } else {
        // No opponents selected - fetch full rating history
        setOpponentIds([]);
        setMatchHistory(null);
        fetchRatingHistory(playerIdFromState);
      }
    }
  }, [location]);

  const fetchMatchHistory = async (pid: number, oids: number[]) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/players/match-history', {
        memberId: pid,
        opponentIds: oids,
      });
      setMatchHistory(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch match history');
    } finally {
      setLoading(false);
    }
  };

  const fetchRatingHistory = async (pid: number) => {
    setLoading(true);
    setError('');
    try {
      // First get player info
      const playerResponse = await api.get(`/players/${pid}`);
      const player = playerResponse.data;
      setPlayerInfo({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
      });
      
      // Then get rating history
      const historyResponse = await api.post('/players/rating-history', {
        memberIds: [pid],
      });
      setRatingHistory(historyResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch rating history');
    } finally {
      setLoading(false);
    }
  };


  // Group matches by opponent
  const matchesByOpponent = matchHistory?.matches.reduce((acc, match) => {
    if (!acc[match.opponentId]) {
      acc[match.opponentId] = [];
    }
    acc[match.opponentId].push(match);
    return acc;
  }, {} as { [key: number]: MatchHistory[] }) || {};

  // Calculate win/loss records per opponent
  const getRecord = (matches: MatchHistory[]) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    
    matches.forEach(match => {
      if (match.memberForfeit) {
        losses++;
      } else if (match.opponentForfeit) {
        wins++;
      } else if (match.memberSets > match.opponentSets) {
        wins++;
      } else if (match.memberSets < match.opponentSets) {
        losses++;
      } else {
        ties++;
      }
    });
    
    return { wins, losses, ties, total: matches.length };
  };

  if (loading) {
    return <div className="card">Loading history...</div>;
  }

  if (!playerId) {
    return (
      <div className="card">
        <h2>History</h2>
        <p>No player selected. Please select a player from the Players tab to view history.</p>
      </div>
    );
  }

  // Show rating history if no opponents selected
  if (opponentIds.length === 0) {
    return (
      <div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>Rating History</h2>
          </div>

          {error && <div className="error-message">{error}</div>}

          {playerInfo && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px' }}>
                {formatPlayerName(playerInfo.firstName, playerInfo.lastName, getNameDisplayOrder())}
              </h3>
            </div>
          )}

          {ratingHistory.length > 0 && ratingHistory[0]?.history.length > 0 ? (
            <div>
              <h3 style={{ marginBottom: '15px' }}>Full Rating History</h3>
              <table style={{ width: '100%', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e9ecef' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Rating</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ratingHistory[0].history]
                    .sort((a, b) => {
                      // Sort in descending order (most recent first)
                      // "Current" entries (tournamentName === 'Current') should appear first
                      if (a.tournamentName === 'Current' && b.tournamentName !== 'Current') return -1;
                      if (b.tournamentName === 'Current' && a.tournamentName !== 'Current') return 1;
                      // Then sort by date descending
                      return new Date(b.date).getTime() - new Date(a.date).getTime();
                    })
                    .map((point, idx) => {
                      // Determine what to link to based on available data
                      const hasTournament = point.tournamentId !== null;
                      const hasMatch = point.matchId !== null;
                      const eventName = point.tournamentName || 'Initial Rating';
                      
                      return (
                        <tr key={idx}>
                          <td style={{ padding: '10px' }}>
                            {new Date(point.date).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                            {point.rating !== null ? point.rating : '-'}
                          </td>
                          <td style={{ padding: '10px' }}>
                            {hasTournament || hasMatch ? (
                              <a
                                href="/tournaments"
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate('/tournaments', {
                                    state: {
                                      tournamentId: point.tournamentId,
                                      matchId: point.matchId,
                                      from: 'history',
                                      restoreScroll: false
                                    }
                                  });
                                }}
                                style={{
                                  color: '#3498db',
                                  textDecoration: 'underline',
                                  cursor: 'pointer'
                                }}
                                title="Click to view tournament/match"
                              >
                                {eventName}
                              </a>
                            ) : (
                              eventName
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : ratingHistory.length > 0 ? (
            <div>
              <p>No rating history available for this player.</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Match History</h2>
        </div>

        {error && <div className="error-message">{error}</div>}

        {matchHistory && (
          <div>
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px' }}>
                {formatPlayerName(matchHistory.member.firstName, matchHistory.member.lastName, getNameDisplayOrder())}
              </h3>
              <p style={{ margin: 0, color: '#666' }}>
                vs {matchHistory.opponents.length} opponent{matchHistory.opponents.length !== 1 ? 's' : ''}:{' '}
                {matchHistory.opponents.map((o, idx) => (
                  <span key={o.id}>
                    {formatPlayerName(o.firstName, o.lastName, getNameDisplayOrder())}
                    {idx < matchHistory.opponents.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            </div>

            {matchHistory.matches.length === 0 ? (
              <div>
                <p>No matches found between the selected players.</p>
              </div>
            ) : (
              <div>
                <h3 style={{ marginBottom: '15px' }}>
                  Total Matches: {matchHistory.matches.length}
                </h3>

                {/* Summary by opponent */}
                <div style={{ marginBottom: '30px' }}>
                  <h4>Summary by Opponent</h4>
                  <table style={{ width: '100%', marginBottom: '20px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#e9ecef' }}>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Opponent</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Wins</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Losses</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Ties</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Total</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(matchesByOpponent).map(([opponentId, matches]) => {
                        const opponent = matchHistory.opponents.find(o => o.id === parseInt(opponentId));
                        const record = getRecord(matches);
                        const winPercentage = record.total > 0 ? ((record.wins / record.total) * 100).toFixed(1) : '0.0';
                        
                        return (
                          <tr key={opponentId}>
                            <td style={{ padding: '10px' }}>
                              {opponent ? formatPlayerName(opponent.firstName, opponent.lastName, getNameDisplayOrder()) : 'Unknown'}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#27ae60' }}>
                              {record.wins}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#e74c3c' }}>
                              {record.losses}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#95a5a6' }}>
                              {record.ties}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                              {record.total}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              {winPercentage}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Detailed match list */}
                <div>
                  <h4>Match Details</h4>
                  <table style={{ width: '100%', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#e9ecef' }}>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Date & Time</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Tournament</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Opponent</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Score</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Player Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchHistory.matches.map((match) => {
                        // Always show score with player first, regardless of actual recorded order
                        const playerScore = match.memberSets;
                        const opponentScore = match.opponentSets;
                        const playerWon = match.memberForfeit ? false : (match.opponentForfeit ? true : playerScore > opponentScore);
                        const playerLost = match.memberForfeit ? true : (match.opponentForfeit ? false : playerScore < opponentScore);
                        
                        const scoreDisplay = match.memberForfeit 
                          ? 'Forfeit' 
                          : match.opponentForfeit 
                          ? 'Forfeit' 
                          : `${playerScore}-${opponentScore}`;
                        
                        const resultDisplay = match.memberForfeit 
                          ? 'L' 
                          : match.opponentForfeit 
                          ? 'W' 
                          : playerWon 
                          ? 'W' 
                          : playerLost 
                          ? 'L' 
                          : 'T';
                        
                        return (
                          <tr key={match.id}>
                            <td style={{ padding: '10px' }}>
                              {new Date(match.matchDate).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px' }}>
                              {match.tournamentType && match.tournamentType !== 'SINGLE_MATCH' ? (
                                <a
                                  href={`/tournaments`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigate('/tournaments', {
                                      state: {
                                        tournamentId: match.tournamentId,
                                        from: 'history',
                                        restoreScroll: false
                                      }
                                    });
                                  }}
                                  style={{
                                    color: '#3498db',
                                    textDecoration: 'underline',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {match.tournamentName || `Tournament #${match.tournamentId}`}
                                </a>
                              ) : (
                                match.tournamentName || `Tournament #${match.tournamentId}`
                              )}
                              {match.tournamentStatus === 'ACTIVE' && (
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#f39c12' }}>
                                  (Active)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px' }}>
                              {formatPlayerName(
                                matchHistory.opponents.find(o => o.id === match.opponentId)?.firstName || '',
                                matchHistory.opponents.find(o => o.id === match.opponentId)?.lastName || '',
                                getNameDisplayOrder()
                              )}
                              {/* Show rating AFTER match with change for non-round-robin tournaments, or just rating for round robin */}
                              {match.opponentRatingAfter !== null && (
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>
                                  ({match.opponentRatingAfter}
                                  {match.tournamentType !== 'ROUND_ROBIN' && match.opponentRatingChange !== null ? (
                                    <>
                                      /
                                      <span style={{ color: match.opponentRatingChange > 0 ? '#27ae60' : match.opponentRatingChange < 0 ? '#e74c3c' : '#666' }}>
                                        {match.opponentRatingChange > 0 ? '+' : ''}{match.opponentRatingChange}
                                      </span>
                                    </>
                                  ) : null}
                                  )
                                </span>
                              )}
                            </td>
                            <td style={{ 
                              padding: '10px', 
                              textAlign: 'center',
                              fontWeight: 'bold',
                            }}>
                              <span style={{
                                color: resultDisplay === 'W' ? '#27ae60' : 
                                       resultDisplay === 'L' ? '#e74c3c' : '#95a5a6'
                              }}>
                                {resultDisplay} {scoreDisplay}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              {match.memberRatingAfter !== null ? (
                                <span style={{ fontSize: '12px', color: '#666' }}>
                                  {match.memberRatingAfter}
                                  {/* Only show rating change for non-round-robin tournaments */}
                                  {match.tournamentType !== 'ROUND_ROBIN' && match.memberRatingChange !== null ? (
                                    <>
                                      {' '}
                                      <span style={{ color: match.memberRatingChange > 0 ? '#27ae60' : match.memberRatingChange < 0 ? '#e74c3c' : '#666' }}>
                                        ({match.memberRatingChange > 0 ? '+' : ''}{match.memberRatingChange})
                                      </span>
                                    </>
                                  ) : match.tournamentType === 'ROUND_ROBIN' ? null : (
                                    <span style={{ color: '#666' }}> (0)</span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#999' }}>N/A</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;

