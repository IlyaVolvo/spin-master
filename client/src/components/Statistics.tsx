import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';

interface RatingHistoryPoint {
  date: string;
  rating: number | null;
  tournamentId: number | null;
  tournamentName: string | null;
  matchId: number | null;
  reason?: string;
}

interface PlayerRatingHistory {
  memberId: number;
  firstName: string;
  lastName: string;
  history: RatingHistoryPoint[];
}

const Statistics: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [ratingHistory, setRatingHistory] = useState<PlayerRatingHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Track which players are enabled for display (all enabled by default)
  const [enabledPlayers, setEnabledPlayers] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Get player IDs from location state (passed from Players component)
    const playerIds = location.state?.playerIds as number[] | undefined;
    if (playerIds && playerIds.length > 0) {
      setSelectedPlayerIds(playerIds);
      fetchRatingHistory(playerIds);
    }
  }, [location]);

  const fetchRatingHistory = async (playerIds: number[]) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/players/rating-history', { memberIds: playerIds });
      setRatingHistory(response.data);
      // Initialize all players as enabled
      setEnabledPlayers(new Set(playerIds));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch rating history');
    } finally {
      setLoading(false);
    }
  };

  const togglePlayerDisplay = (memberId: number) => {
    setEnabledPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  // Transform data for chart
  const chartData = React.useMemo(() => {
    if (ratingHistory.length === 0) return [];

    // Get all unique dates from all players' histories (only dates where ratings actually change)
    const allDates = new Set<string>();
    ratingHistory.forEach(player => {
      player.history.forEach(point => {
        if (point.rating !== null) {
          allDates.add(point.date);
        }
      });
    });

    const sortedDates = Array.from(allDates).sort();

    // Build chart data points - only include dates where ratings actually changed
    return sortedDates.map(date => {
      const dataPoint: any = {
        date: new Date(date).toLocaleDateString(),
        timestamp: date,
      };

      ratingHistory.forEach(player => {
        // Only include players who have rating history (non-null ratings) AND are enabled
        if (player.history.length > 0 && enabledPlayers.has(player.memberId)) {
          // Find the rating that was active at this specific date
          // First, check if there are any rating changes on this exact date
          const pointsOnThisDate = player.history
            .filter(p => p.date === date && p.rating !== null);
          
          if (pointsOnThisDate.length > 0) {
            // Use the LAST (most recent) rating change on this date
            // Since history is in chronological order, the last element is the most recent
            const lastPointOnDate = pointsOnThisDate[pointsOnThisDate.length - 1];
            const playerName = formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder());
            dataPoint[playerName] = lastPointOnDate.rating;
          } else {
            // Find the most recent rating change before this date
            const previousPoints = player.history
              .filter(p => p.date < date && p.rating !== null)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            if (previousPoints.length > 0) {
              // Use the rating that was active before this date
              const playerName = formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder());
              dataPoint[playerName] = previousPoints[0].rating;
            }
          }
        }
      });

      return dataPoint;
    });
  }, [ratingHistory, enabledPlayers]);

  // Calculate Y-axis domain based on min/max ratings (only for enabled players)
  const yAxisDomain = React.useMemo(() => {
    if (ratingHistory.length === 0) return [0, 2000];

    // Collect all rating values from enabled players only
    const allRatings: number[] = [];
    ratingHistory.forEach(player => {
      if (enabledPlayers.has(player.memberId)) {
      player.history.forEach(point => {
        if (point.rating !== null) {
          allRatings.push(point.rating);
        }
      });
      }
    });

    if (allRatings.length === 0) return [0, 2000];

    const minRating = Math.min(...allRatings);
    const maxRating = Math.max(...allRatings);

    // Set domain to +/- 100 of min/max
    const minDomain = Math.max(0, minRating - 100);
    const maxDomain = maxRating + 100;

    return [minDomain, maxDomain];
  }, [ratingHistory, enabledPlayers]);

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#0088fe', '#00c49f', '#ffbb28', '#ff8042'];

  if (loading) {
    return <div className="card">Loading rating history...</div>;
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Player Statistics</h2>
        </div>

        {error && <div className="error-message">{error}</div>}

        {selectedPlayerIds.length === 0 ? (
          <div>
            <p>No players selected. Please select players from the Players tab to view statistics.</p>
          </div>
        ) : ratingHistory.length === 0 ? (
          <div>
            <p>No rating history available for selected players.</p>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Selected players: {selectedPlayerIds.length}
            </p>
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom: '20px' }}>
              Rating History for {ratingHistory.length} Player{ratingHistory.length !== 1 ? 's' : ''}
            </h3>
            
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Selected Players (click checkbox to show/hide on chart):</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                {ratingHistory.map((player, index) => {
                  const isEnabled = enabledPlayers.has(player.memberId);
                  return (
                    <label
                    key={player.memberId}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      padding: '6px 12px',
                        backgroundColor: isEnabled ? colors[index % colors.length] : '#95a5a6',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '14px',
                        cursor: 'pointer',
                        opacity: isEnabled ? 1 : 0.6,
                        transition: 'opacity 0.2s ease',
                    }}
                  >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => togglePlayerDisplay(player.memberId)}
                        style={{
                          cursor: 'pointer',
                          width: '16px',
                          height: '16px',
                        }}
                      />
                    {formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder())}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ width: '100%', height: '500px', marginBottom: '20px' }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    domain={yAxisDomain}
                    label={{ value: 'Rating', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
                    formatter={(value: any, name: string) => {
                      // Return the actual value from the data point
                      if (value === null || value === undefined) return null;
                      return [value, name];
                    }}
                  />
                  <Legend />
                  {ratingHistory
                    .filter(player => player.history.length > 0 && enabledPlayers.has(player.memberId)) // Only show players with rating history AND enabled
                    .map((player) => {
                      const playerName = formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder());
                      // Find the original index for color consistency
                      const originalIndex = ratingHistory.findIndex(p => p.memberId === player.memberId);
                      return (
                        <Line
                          key={player.memberId}
                          type="monotone"
                          dataKey={playerName}
                          stroke={colors[originalIndex % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          connectNulls={false}
                        />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: '30px' }}>
              <h4>Rating History Details</h4>
              {ratingHistory.map((player, index) => (
                <div key={player.memberId} style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <h5 style={{ marginTop: 0, color: colors[index % colors.length] }}>
                    {formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder())}
                  </h5>
                  {player.history.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No rating history available</p>
                  ) : (
                    <table style={{ width: '100%', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e9ecef' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Rating</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Event</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...player.history]
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
                            <td style={{ padding: '8px' }}>
                              {new Date(point.date).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                              {point.rating !== null ? point.rating : '-'}
                            </td>
                            <td style={{ padding: '8px' }}>
                                {hasTournament || hasMatch ? (
                                  <a
                                    href="/tournaments"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigate('/tournaments', {
                                        state: {
                                          tournamentId: point.tournamentId,
                                          matchId: point.matchId,
                                          from: 'statistics',
                                          restoreScroll: false
                                        }
                                      });
                                    }}
                                    style={{
                                      color: '#3498db',
                                      textDecoration: 'underline',
                                      cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#2980b9';
                                      e.currentTarget.style.textDecoration = 'underline';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '#3498db';
                                      e.currentTarget.style.textDecoration = 'underline';
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
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistics;

