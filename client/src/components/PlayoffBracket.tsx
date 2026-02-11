import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TraditionalBracket } from './TraditionalBracket';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { MatchEntryPopup } from './MatchEntryPopup';
import { updateMatchCountsCache } from './Players';
import api from '../utils/api';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  rating: number | null;
}

interface BracketMatch {
  id: number; // BracketMatch ID
  round: number;
  position: number;
  member1Id: number | null;
  member2Id: number | null;
  player1IsBye: boolean;
  player2IsBye: boolean;
  matchId?: number;
  winnerId?: number | null;
  nextMatchId?: number | null;
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  match?: {
    id: number;
    player1RatingBefore: number | null;
    player1RatingChange: number | null;
    player2RatingBefore: number | null;
    player2RatingChange: number | null;
  } | null;
}

interface TournamentParticipant {
  id: number;
  member: Member;
  memberId: number;
  playerRatingAtTime: number | null;
}

interface PlayoffBracketProps {
  tournamentId: number;
  participants: TournamentParticipant[];
  matches: BracketMatch[];
  onBracketUpdate?: () => void;
  isReadOnly?: boolean; // When true, disable all editing (for completed tournaments)
  tournamentStatus?: 'ACTIVE' | 'COMPLETED'; // Tournament status to determine rating format
  cancelled?: boolean; // True if tournament was cancelled (moved to COMPLETED but not finished)
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

export const PlayoffBracket: React.FC<PlayoffBracketProps> = ({
  tournamentId,
  participants,
  matches,
  onBracketUpdate,
  isReadOnly = false,
  tournamentStatus = 'ACTIVE',
  cancelled = false,
}) => {
  const navigate = useNavigate();
  const [editingFinalMatch, setEditingFinalMatch] = useState<EditingMatch | null>(null);
  
  const handleViewStats = () => {
    // Show statistics for all players in this tournament
    const allPlayerIds = participants.map(p => p.member.id);
    navigate('/statistics', { state: { playerIds: allPlayerIds, from: 'tournaments' } });
  };
  
  const handleViewHistory = (playerId: number) => {
    // Get all other player IDs from this tournament
    const allOtherPlayerIds = participants
      .map(p => p.member.id)
      .filter(id => id !== playerId);
    
    navigate('/history', { 
      state: { 
        playerId: playerId, 
        opponentIds: allOtherPlayerIds,
        from: 'tournaments'
      } 
    });
  };

  const handleSaveFinalMatch = async () => {
    if (!editingFinalMatch || !tournamentId) {
      return;
    }

    if (editingFinalMatch.player1Forfeit && editingFinalMatch.player2Forfeit) {
      alert('Only one player can forfeit');
      return;
    }

    // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
    if (!editingFinalMatch.player1Forfeit && !editingFinalMatch.player2Forfeit) {
      const player1Sets = parseInt(editingFinalMatch.player1Sets) || 0;
      const player2Sets = parseInt(editingFinalMatch.player2Sets) || 0;
      // Disallow equal scores including 0:0
      if (player1Sets === player2Sets) {
        alert('Scores cannot be equal. One player must win.');
        return;
      }
    }

    const matchData: any = {
      member1Id: editingFinalMatch.member1Id,
      member2Id: editingFinalMatch.member2Id,
    };

    // If forfeit, send forfeit flags; otherwise send sets
    if (editingFinalMatch.player1Forfeit || editingFinalMatch.player2Forfeit) {
      matchData.player1Forfeit = editingFinalMatch.player1Forfeit;
      matchData.player2Forfeit = editingFinalMatch.player2Forfeit;
    } else {
      matchData.player1Sets = parseInt(editingFinalMatch.player1Sets) || 0;
      matchData.player2Sets = parseInt(editingFinalMatch.player2Sets) || 0;
      matchData.player1Forfeit = false;
      matchData.player2Forfeit = false;
    }

    try {
      const response = await api.patch(`/tournaments/${tournamentId}/matches/${editingFinalMatch.matchId}`, matchData);
      const savedMatch = response.data;
      
      // Update match counts cache
      if (savedMatch) {
        updateMatchCountsCache({
          id: savedMatch.id,
          member1Id: savedMatch.member1Id,
          member2Id: savedMatch.member2Id,
          updatedAt: savedMatch.updatedAt || savedMatch.createdAt,
          createdAt: savedMatch.createdAt,
        }, false);
      }
      setEditingFinalMatch(null);
      if (onBracketUpdate) {
        onBracketUpdate();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update match');
    }
  };

  // Find the final match for championship display
  const championshipLine = useMemo(() => {
    if (!matches || matches.length === 0) return null;
    
    // Find the match with the highest round number (final match)
    const maxRound = Math.max(...matches.map(m => m.round || 1));
    const finalMatches = matches.filter(m => (m.round || 1) === maxRound);
    
    if (finalMatches.length !== 1) return null;
    const finalMatch = finalMatches[0];
    
    // Check if both players are determined (finalists are set)
    if (!finalMatch.member1Id || !finalMatch.member2Id || finalMatch.player1IsBye || finalMatch.player2IsBye) {
      return null;
    }
    
    // Check if match is complete
    const hasScore = finalMatch.player1Sets !== undefined && finalMatch.player2Sets !== undefined &&
                     ((finalMatch.player1Sets ?? 0) > 0 || (finalMatch.player2Sets ?? 0) > 0);
    const isComplete = finalMatch.winnerId && hasScore;
    
    // Find players
    const player1Participant = participants.find(p => p.member.id === finalMatch.member1Id);
    const player2Participant = participants.find(p => p.member.id === finalMatch.member2Id);
    
    if (!player1Participant || !player2Participant) return null;
    
    const player1Name = formatPlayerName(player1Participant.member.firstName, player1Participant.member.lastName, getNameDisplayOrder());
    const player2Name = formatPlayerName(player2Participant.member.firstName, player2Participant.member.lastName, getNameDisplayOrder());
    
    // For active tournaments without complete score: show editable interface
    if (tournamentStatus === 'ACTIVE' && !isComplete && !isReadOnly) {
      // Use matchId if match exists, otherwise use bracketMatchId (id field)
      const matchIdToUse = finalMatch.matchId || finalMatch.id || 0;
      const currentPlayer1Sets = finalMatch.player1Sets ?? 0;
      const currentPlayer2Sets = finalMatch.player2Sets ?? 0;
      
      return {
        type: 'active' as const,
        player1: player1Participant,
        player2: player2Participant,
        player1Name,
        player2Name,
        matchId: matchIdToUse,
        player1Sets: currentPlayer1Sets.toString(),
        player2Sets: currentPlayer2Sets.toString(),
        player1Forfeit: finalMatch.player1Forfeit || false,
        player2Forfeit: finalMatch.player2Forfeit || false,
      };
    }
    
    // For completed tournaments: show final result
    if (!isComplete) return null;
    
    const winnerParticipant = participants.find(p => p.member.id === finalMatch.winnerId);
    const loserId = finalMatch.member1Id === finalMatch.winnerId ? finalMatch.member2Id : finalMatch.member1Id;
    const loserParticipant = participants.find(p => p.member.id === loserId);
    
    if (!winnerParticipant || !loserParticipant) return null;
    
    const player1Sets = finalMatch.player1Sets ?? 0;
    const player2Sets = finalMatch.player2Sets ?? 0;
    const winnerIsPlayer1 = finalMatch.winnerId === finalMatch.member1Id;
    
    // Format score (winner:loser)
    const scoreStr = winnerIsPlayer1 
      ? `${player1Sets}:${player2Sets}` 
      : `${player2Sets}:${player1Sets}`;
    
    // Get winner rating data
    let winnerRatingAfter: number | null = null;
    let winnerRatingChange: number | null = null;
    
    if (finalMatch.match) {
      const isPlayer1 = finalMatch.winnerId === finalMatch.member1Id;
      if (isPlayer1) {
        winnerRatingChange = finalMatch.match.player1RatingChange;
        const ratingBefore = finalMatch.match.player1RatingBefore;
        if (winnerRatingChange !== null && ratingBefore !== null) {
          winnerRatingAfter = ratingBefore + winnerRatingChange;
        }
      } else {
        winnerRatingChange = finalMatch.match.player2RatingChange;
        const ratingBefore = finalMatch.match.player2RatingBefore;
        if (winnerRatingChange !== null && ratingBefore !== null) {
          winnerRatingAfter = ratingBefore + winnerRatingChange;
        }
      }
    }
    
    // Get loser rating data
    let loserRatingAfter: number | null = null;
    let loserRatingChange: number | null = null;
    
    if (finalMatch.match) {
      const isPlayer1 = finalMatch.winnerId !== finalMatch.member1Id;
      if (isPlayer1) {
        loserRatingChange = finalMatch.match.player1RatingChange;
        const ratingBefore = finalMatch.match.player1RatingBefore;
        if (loserRatingChange !== null && ratingBefore !== null) {
          loserRatingAfter = ratingBefore + loserRatingChange;
        }
      } else {
        loserRatingChange = finalMatch.match.player2RatingChange;
        const ratingBefore = finalMatch.match.player2RatingBefore;
        if (loserRatingChange !== null && ratingBefore !== null) {
          loserRatingAfter = ratingBefore + loserRatingChange;
        }
      }
    }
    
    // Build the championship line as JSX with styling
    const winnerName = formatPlayerName(winnerParticipant.member.firstName, winnerParticipant.member.lastName, getNameDisplayOrder());
    const loserName = formatPlayerName(loserParticipant.member.firstName, loserParticipant.member.lastName, getNameDisplayOrder());
    
    const winnerChangeStr = winnerRatingChange !== null && winnerRatingAfter !== null
      ? (winnerRatingChange >= 0 ? `+${winnerRatingChange}` : `${winnerRatingChange}`)
      : null;
    
    return {
      type: 'completed' as const,
      winnerName,
      loserName,
      scoreStr,
      winnerRatingAfter,
      winnerChangeStr,
      loserRatingAfter,
      loserRatingChange,
    };
  }, [matches, participants, tournamentStatus, isReadOnly]);

  return (
    <div style={{ padding: '0 20px 20px 20px' }}>
      <div style={{ marginBottom: '0', backgroundColor: '#e9ecef', marginLeft: '-20px', marginRight: '-20px', paddingLeft: '20px', paddingRight: '20px', paddingTop: '10px', paddingBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <h3 style={{ margin: 0 }}>Playoff Bracket</h3>
          <button
            onClick={handleViewStats}
            title="View Statistics for All Players in This Tournament"
            style={{
              padding: '4px 8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3498db',
            }}
          >
            📊
          </button>
          {cancelled && tournamentStatus === 'COMPLETED' ? (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '30px',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: 0 }}>
                <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>Tournament has not been completed</span>
              </h3>
            </div>
          ) : championshipLine && championshipLine.type === 'completed' ? (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '30px',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: 0 }}>
                <span>🥇 </span>
                <span style={{ fontWeight: 'bold' }}>{championshipLine.winnerName}</span>
              </h3>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <TraditionalBracket
        tournamentId={tournamentId}
        participants={participants}
        matches={matches.map(m => ({
          ...m,
          player1Id: m.member1Id,
          player2Id: m.member2Id,
          player1Sets: m.player1Sets ?? (m as any).match?.player1Sets ?? undefined,
          player2Sets: m.player2Sets ?? (m as any).match?.player2Sets ?? undefined,
          player1Forfeit: m.player1Forfeit ?? (m as any).match?.player1Forfeit ?? undefined,
          player2Forfeit: m.player2Forfeit ?? (m as any).match?.player2Forfeit ?? undefined,
        }))}
        onMatchUpdate={onBracketUpdate}
        isReadOnly={isReadOnly}
        onHistoryClick={handleViewHistory}
        tournamentStatus={tournamentStatus}
      />

      {/* Match Entry Popup for Final Match */}
      {editingFinalMatch && tournamentId && (() => {
        const player1 = participants.find(p => p.member.id === editingFinalMatch.member1Id);
        const player2 = participants.find(p => p.member.id === editingFinalMatch.member2Id);
        if (!player1 || !player2) return null;
        
        return (
          <MatchEntryPopup
            editingMatch={editingFinalMatch}
            player1={player1.member}
            player2={player2.member}
            showForfeitOptions={true}
            onSetEditingMatch={setEditingFinalMatch}
            onSave={handleSaveFinalMatch}
            onCancel={() => setEditingFinalMatch(null)}
          />
        );
      })()}
    </div>
  );
};



