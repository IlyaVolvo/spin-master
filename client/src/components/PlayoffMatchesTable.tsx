import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { formatActiveTournamentRating } from '../utils/ratingFormatter';
import { MatchEntryPopup } from './MatchEntryPopup';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  rating: number | null;
}

interface Match {
  id: number;
  member1Id: number;
  member2Id: number;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  round?: number | null;
  position?: number | null;
  nextMatchId?: number | null;
}

interface TournamentParticipant {
  id: number;
  member: Member;
  memberId: number;
  playerRatingAtTime: number | null;
}

interface PlayoffMatchesTableProps {
  tournamentId: number;
  participants: TournamentParticipant[];
  matches: Match[];
  onMatchUpdate?: () => void;
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

export const PlayoffMatchesTable: React.FC<PlayoffMatchesTableProps> = ({
  tournamentId,
  participants,
  matches,
  onMatchUpdate,
}) => {
  const navigate = useNavigate();
  const [editingMatch, setEditingMatch] = useState<EditingMatch | null>(null);
  
  const handleViewMatchHistoryAndStats = (player1Id: number, player2Id: number) => {
    // Show history between the two players and their statistics
    // First show history, then user can navigate to statistics if needed
    navigate('/history', { 
      state: { 
        playerId: player1Id, 
        opponentIds: [player2Id],
        from: 'tournaments'
      } 
    });
  };

  const getPlayerById = (playerId: number | null): TournamentParticipant | undefined => {
    if (!playerId) return undefined;
    return participants.find(p => p.member.id === playerId);
  };

  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped: Record<number, Match[]> = {};
    matches.forEach(match => {
      const round = match.round || 1;
      if (!grouped[round]) {
        grouped[round] = [];
      }
      grouped[round].push(match);
    });

    // Sort matches within each round by position
    Object.keys(grouped).forEach(roundStr => {
      const round = parseInt(roundStr);
      grouped[round].sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    return grouped;
  }, [matches]);

  const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
  const maxRound = Math.max(...rounds, 1);

  const getRoundLabel = (round: number, maxRound: number, bracketSize: number): string => {
    if (round === maxRound) return 'Final';
    if (round === maxRound - 1) return 'Semifinals';
    if (round === maxRound - 2) return 'Quarterfinals';
    const numMatches = bracketSize / Math.pow(2, round);
    if (numMatches === 16) return 'Round of 16';
    if (numMatches === 32) return 'Round of 32';
    if (numMatches === 64) return 'Round of 64';
    if (numMatches === 128) return 'Round of 128';
    return `Round ${round}`;
  };

  const calculateBracketSize = (numPlayers: number): number => {
    return Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  };

  const bracketSize = calculateBracketSize(participants.length);

  const handleEditMatch = (match: Match) => {
    setEditingMatch({
      matchId: match.id,
      member1Id: match.member1Id,
      member2Id: match.member2Id,
      player1Sets: match.player1Sets.toString() || '0',
      player2Sets: match.player2Sets.toString() || '0',
      player1Forfeit: match.player1Forfeit || false,
      player2Forfeit: match.player2Forfeit || false,
    });
  };

  const handleSaveMatch = async () => {
    if (!editingMatch) return;

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

    try {
      await api.patch(`/tournaments/${tournamentId}/matches/${editingMatch.matchId}`, matchData);
      setEditingMatch(null);
      if (onMatchUpdate) {
        onMatchUpdate();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update match');
    }
  };

  const getWinnerId = (match: Match): number | null => {
    if (match.player1Forfeit) return match.member2Id;
    if (match.player2Forfeit) return match.member1Id;
    if (match.player1Sets > match.player2Sets) return match.member1Id;
    if (match.player2Sets > match.player1Sets) return match.member2Id;
    return null;
  };

  const isMatchCompleted = (match: Match): boolean => {
    return match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit === true || match.player2Forfeit === true;
  };

  return (
    <div style={{ padding: '20px' }}>
      <h4 style={{ marginBottom: '20px' }}>Playoff Matches</h4>
      
      {rounds.map(round => {
        const roundMatches = matchesByRound[round] || [];
        
        return (
          <div key={round} style={{ marginBottom: '30px' }}>
            <h5 style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '16px' }}>
              {getRoundLabel(round, maxRound, bracketSize)}
            </h5>
            
            <table style={{ 
              borderCollapse: 'collapse', 
              width: '100%', 
              marginBottom: '20px',
              backgroundColor: 'white',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Player 1</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center', width: '80px' }}>Sets</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Player 2</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center', width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roundMatches.map(match => {
                  const player1 = getPlayerById(match.member1Id);
                  const player2 = getPlayerById(match.member2Id);
                  const winnerId = getWinnerId(match);
                  const isCompleted = isMatchCompleted(match);
                  const isBye1 = match.member1Id === 0;
                  const isBye2 = match.member2Id === 0;

                  return (
                    <tr 
                      key={match.id}
                      style={{ 
                        backgroundColor: isCompleted && winnerId === match.member1Id 
                          ? '#d4edda' 
                          : isCompleted && winnerId === match.member2Id 
                          ? '#d4edda' 
                          : 'white' 
                      }}
                    >
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                        {isBye1 ? (
                          <span style={{ fontStyle: 'italic', color: '#999' }}>BYE</span>
                        ) : player1 ? (
                          <div>
                            <div style={{ fontWeight: 'bold' }}>
                              {formatPlayerName(player1.member.firstName, player1.member.lastName, getNameDisplayOrder())}
                            </div>
                            {player1.playerRatingAtTime && (
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                Rating: {formatActiveTournamentRating(player1.playerRatingAtTime, player1.member.rating)}
                              </div>
                            )}
                            {match.player1Forfeit && (
                              <span style={{ color: '#dc3545', fontSize: '12px' }}>(Forfeit)</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>TBD</span>
                        )}
                      </td>
                      
                      <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <span>
                            {isCompleted ? (
                              `${match.player1Sets} - ${match.player2Sets}`
                            ) : (
                              <span style={{ color: '#999' }}>-</span>
                            )}
                          </span>
                          {isCompleted && !isBye1 && !isBye2 && player1 && player2 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewMatchHistoryAndStats(match.member1Id, match.member2Id);
                              }}
                              title="View History & Statistics between these players"
                              style={{
                                padding: '2px 4px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#3498db',
                                marginLeft: '8px',
                              }}
                            >
                              📊📜
                            </button>
                          )}
                        </div>
                      </td>
                      
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                        {isBye2 ? (
                          <span style={{ fontStyle: 'italic', color: '#999' }}>BYE</span>
                        ) : player2 ? (
                          <div>
                            <div style={{ fontWeight: 'bold' }}>
                              {formatPlayerName(player2.member.firstName, player2.member.lastName, getNameDisplayOrder())}
                            </div>
                            {player2.playerRatingAtTime && (
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                Rating: {formatActiveTournamentRating(player2.playerRatingAtTime, player2.member.rating)}
                              </div>
                            )}
                            {match.player2Forfeit && (
                              <span style={{ color: '#dc3545', fontSize: '12px' }}>(Forfeit)</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>TBD</span>
                        )}
                      </td>
                      
                      <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                        {!isBye1 && !isBye2 && (
                          <button
                            onClick={() => handleEditMatch(match)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#3498db',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            {isCompleted ? 'Edit' : 'Enter Result'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Match Edit Dialog */}
      {editingMatch && (() => {
        const player1 = participants.find(p => p.member.id === editingMatch.member1Id);
        const player2 = participants.find(p => p.member.id === editingMatch.member2Id);
        if (!player1 || !player2) return null;
        
        return (
          <MatchEntryPopup
            editingMatch={editingMatch}
            player1={player1.member}
            player2={player2.member}
            tournamentType="PLAYOFF"
            onSetEditingMatch={setEditingMatch}
            onSave={handleSaveMatch}
            onCancel={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
};

