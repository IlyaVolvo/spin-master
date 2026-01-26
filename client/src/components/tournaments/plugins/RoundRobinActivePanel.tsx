import React, { useState, useMemo } from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { MatchEntryPopup } from '../../MatchEntryPopup';
import api from '../../../utils/api';
import { updateMatchCountsCache } from '../../Players';
import './RoundRobinActivePanel.css';

interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  points: number; // Round Robin points (2 for win, 1 for loss)
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

export const RoundRobinActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const [editingMatch, setEditingMatch] = useState<EditingMatch | null>(null);

  // Build results matrix for display and editing
  const buildResultsMatrix = (tournament: any) => {
    const participants = tournament.participants;
    const participantData = tournament.participants;
    const matrix: { [key: number]: { [key: number]: string } } = {};
    const matchMap: { [key: string]: any } = {};
    
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
    tournament.matches.forEach((match: any) => {
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

  // Generate matrix and helper data
  const { participants, participantData, matrix, matchMap } = useMemo(() => {
    return buildResultsMatrix(tournament);
  }, [tournament]);

  // Helper function to get player name
  const getPlayerName = (memberId: number) => {
    const participant = participants.find((p: any) => p.member.id === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Helper function to get player object
  const getPlayer = (memberId: number) => {
    const participant = participants.find((p: any) => p.member.id === memberId);
    return participant?.member;
  };

  // Handle click on cell to add/edit match using the old score icon
  const handleCellClick = (member1Id: number, member2Id: number) => {
    // Skip if trying to edit a BYE match or diagonal
    if (member1Id === member2Id) return;
    
    const matchKey = `${member1Id}-${member2Id}`;
    const match = matchMap[matchKey];
    
    if (match) {
      // Edit existing match
      setEditingMatch({
        matchId: match.id,
        member1Id: match.member1Id,
        member2Id: match.member2Id ?? 0,
        player1Sets: match.player1Sets.toString(),
        player2Sets: match.player2Sets.toString(),
        player1Forfeit: match.player1Forfeit || false,
        player2Forfeit: match.player2Forfeit || false,
      });
    } else {
      // Add new match
      setEditingMatch({
        matchId: 0, // 0 indicates new match
        member1Id: member1Id,
        member2Id: member2Id,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      });
    }
  };

  // Handle saving edited/added match
  const handleMatchSave = async () => {
    if (!editingMatch) return;

    try {
      // Validate forfeit: only one player can forfeit
      if (editingMatch.player1Forfeit && editingMatch.player2Forfeit) {
        onError('Only one player can forfeit');
        return;
      }

      // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
      if (!editingMatch.player1Forfeit && !editingMatch.player2Forfeit) {
        const player1Sets = parseInt(editingMatch.player1Sets) || 0;
        const player2Sets = parseInt(editingMatch.player2Sets) || 0;
        // Disallow equal scores including 0:0
        if (player1Sets === player2Sets) {
          onError('Scores cannot be equal. One player must win.');
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

      let savedMatch: any;
      if (editingMatch.matchId === 0) {
        // New match - create it
        const response = await api.post(`/tournaments/${tournament.id}/matches`, matchData);
        savedMatch = response.data;
        onSuccess && onSuccess('Match result added successfully');
      } else {
        // Existing match - update it
        const response = await api.patch(`/tournaments/${tournament.id}/matches/${editingMatch.matchId}`, matchData);
        savedMatch = response.data;
        onSuccess && onSuccess('Match result updated successfully');
      }
      
      // Update match counts cache incrementally
      if (savedMatch) {
        updateMatchCountsCache({
          id: savedMatch.id,
          member1Id: savedMatch.member1Id,
          member2Id: savedMatch.member2Id,
          updatedAt: savedMatch.updatedAt || savedMatch.createdAt,
          createdAt: savedMatch.createdAt,
        }, editingMatch.matchId === 0);
      }
      
      setEditingMatch(null);
      onMatchUpdate && onMatchUpdate(savedMatch);
      
      // Update tournament data
      if (onTournamentUpdate) {
        const updatedTournament = await api.get(`/tournaments/${tournament.id}`);
        onTournamentUpdate(updatedTournament.data);
      }
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      onError(apiError || 'Failed to save match result');
    }
  };

  // Handle cancel editing
  const handleMatchCancel = () => {
    setEditingMatch(null);
  };

  // Handle clear match
  const handleMatchClear = async () => {
    if (!editingMatch || editingMatch.matchId === 0) return;

    try {
      await api.delete(`/tournaments/${tournament.id}/matches/${editingMatch.matchId}`);
      setEditingMatch(null);
      onSuccess && onSuccess('Match result cleared successfully');
      
      // Update tournament data
      if (onTournamentUpdate) {
        const updatedTournament = await api.get(`/tournaments/${tournament.id}`);
        onTournamentUpdate(updatedTournament.data);
      }
      
      onMatchUpdate && onMatchUpdate({} as any);
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      onError(apiError || 'Failed to clear match result');
    }
  };

  return (
    <div className="round-robin-active">
      <div className="round-robin-active__section">
        <h4>Results Matrix</h4>
        <div style={{ marginBottom: '20px', display: 'inline-block' }}>
          <table 
            style={{ 
              borderCollapse: 'collapse', 
              fontSize: '14px', 
              tableLayout: 'auto'
            }}
          >
            <thead>
              <tr>
                <th style={{ 
                  padding: '6px 8px', 
                  border: '1px solid #ddd', 
                  backgroundColor: '#f8f9fa', 
                  textAlign: 'left', 
                  whiteSpace: 'nowrap' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Player</span>
                  </div>
                </th>
                {participants.map((participant: any) => (
                  <th
                    key={participant.member.id}
                    style={{
                      padding: '8px',
                      border: '1px solid #ddd',
                      backgroundColor: '#f8f9fa',
                      minWidth: '80px',
                      textAlign: 'center',
                      fontWeight: 'normal',
                    }}
                  >
                    <div>
                      {formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder())}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((participant1: any) => (
                <tr key={participant1.member.id}>
                  <td
                    style={{
                      padding: '6px 8px',
                      border: '1px solid #ddd',
                      backgroundColor: '#f8f9fa',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span>{formatPlayerName(participant1.member.firstName, participant1.member.lastName, getNameDisplayOrder())}</span>
                    </div>
                  </td>
                  {participants.map((participant2: any) => {
                    const score = matrix[participant1.member.id][participant2.member.id];
                    const isDiagonal = participant1.member.id === participant2.member.id;
                    const hasScore = score && score !== '';
                    const isForfeit = score === 'W' || score === 'L';
                    const cellStyle: React.CSSProperties = {
                      padding: '8px',
                      border: '1px solid #ddd',
                      textAlign: 'center',
                      backgroundColor: isDiagonal ? '#e9ecef' : '#fff',
                      fontWeight: isDiagonal ? 'normal' : 'bold',
                      opacity: isDiagonal ? 1 : hasScore ? 1 : 0.7,
                      minWidth: '80px',
                      width: '80px',
                      cursor: !isDiagonal ? 'pointer' : 'default',
                    };

                    // Highlight winner (higher score or W) for played matches
                    if (!isDiagonal && hasScore) {
                      if (isForfeit) {
                        if (score === 'W') {
                          cellStyle.backgroundColor = '#d4edda';
                        } else {
                          cellStyle.backgroundColor = '#f8d7da';
                        }
                      } else {
                        const [score1, score2] = score.split(' - ').map(Number);
                        if (score1 > score2) {
                          cellStyle.backgroundColor = '#d4edda';
                        } else if (score2 > score1) {
                          cellStyle.backgroundColor = '#f8d7da';
                        }
                      }
                    }

                    return (
                      <td
                        key={participant2.member.id}
                        style={cellStyle}
                        onClick={() => {
                          if (!isDiagonal) {
                            handleCellClick(participant1.member.id, participant2.member.id);
                          }
                        }}
                        title={
                          isDiagonal 
                            ? 'Diagonal cell' 
                            : hasScore 
                              ? 'Click to edit match' 
                              : 'Click to add match'
                        }
                      >
                        {isDiagonal ? (
                          <span style={{ opacity: 0.5 }}>—</span>
                        ) : hasScore ? (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            minWidth: '60px',
                            height: '20px',
                          }}>
                            <span style={{ fontSize: '14px', color: '#666', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              {score}
                            </span>
                          </div>
                        ) : (
                          // Score entry icon from old implementation
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            cursor: 'pointer',
                            minWidth: '60px',
                            height: '20px',
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
                                opacity: 0.7,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(participant1.member.id, participant2.member.id);
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
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            Progress: {tournament.matches.filter(m => m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit).length} / {(participants.length * (participants.length - 1)) / 2} matches played
            <span style={{ color: '#e67e22', marginLeft: '10px' }}>
              ⚠️ All matches must be played before completing tournament
            </span>
          </p>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
            Green cells indicate wins for the row player, red cells indicate losses. Diagonal shows player names. Click any cell to add or edit a match.
          </p>
        </div>
      </div>

      {/* Match Entry Popup - using the proper component */}
      {editingMatch && (
        <MatchEntryPopup
          editingMatch={editingMatch}
          player1={getPlayer(editingMatch.member1Id)!}
          player2={getPlayer(editingMatch.member2Id)!}
          tournamentType="ROUND_ROBIN"
          onSetEditingMatch={setEditingMatch}
          onSave={handleMatchSave}
          onCancel={handleMatchCancel}
          onClear={handleMatchClear}
          showClearButton={editingMatch.matchId > 0}
        />
      )}
    </div>
  );
};
