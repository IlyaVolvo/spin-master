import React, { useState } from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { TraditionalBracket } from '../../TraditionalBracket';
import { MatchEntryPopup } from '../../MatchEntryPopup';
import { createPlayoffMatchUpdater } from '../utils/playoffMatchUpdater';
import './PlayoffActivePanel.css';

export const PlayoffActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const [editingMatch, setEditingMatch] = useState<any>(null);
  const [editingBracketMatchId, setEditingBracketMatchId] = useState<number | null>(null);

  const playoffUpdater = createPlayoffMatchUpdater(tournament.id);

  // Helper function to find bracket match ID for a given match
  const findBracketMatchId = (matchId: number): number | null => {
    const bracketMatch = tournament.bracketMatches?.find(bm => bm.match?.id === matchId);
    return bracketMatch?.id || null;
  };

  const handleSetEditingMatch = (match: any, bracketMatchId?: number) => {
    setEditingMatch(match);
    setEditingBracketMatchId(bracketMatchId || findBracketMatchId(match.matchId) || null);
  };

  const handleSaveMatchEdit = async () => {
    if (!editingMatch) return;

    try {
      const matchData = {
        member1Id: editingMatch.member1Id,
        member2Id: editingMatch.member2Id,
        player1Sets: parseInt(editingMatch.player1Sets) || 0,
        player2Sets: parseInt(editingMatch.player2Sets) || 0,
        player1Forfeit: editingMatch.player1Forfeit,
        player2Forfeit: editingMatch.player2Forfeit,
      };

      if (editingMatch.matchId === 0) {
        // Create new match - use bracketMatchId as the matchId for playoff tournaments
        if (!editingBracketMatchId) {
          onError('Bracket match ID is required for playoff matches');
          return;
        }

        // For playoff tournaments, we use PATCH with bracketMatchId to create/link match
        const matchData = {
          member1Id: editingMatch.member1Id,
          member2Id: editingMatch.member2Id,
          player1Sets: parseInt(editingMatch.player1Sets) || 0,
          player2Sets: parseInt(editingMatch.player2Sets) || 0,
          player1Forfeit: editingMatch.player1Forfeit,
          player2Forfeit: editingMatch.player2Forfeit,
        };

        await playoffUpdater.createMatch(matchData, editingBracketMatchId, {
          onSuccess,
          onError,
          onTournamentUpdate,
          onMatchUpdate,
          onBracketUpdate: () => {
            // Refresh tournament data to update bracket display
            if (onTournamentUpdate) {
              fetch(`/api/tournaments/${tournament.id}`)
                .then(res => res.json())
                .then(updatedTournament => {
                  onTournamentUpdate(updatedTournament);
                })
                .catch(err => {
                  console.error('Failed to refresh tournament:', err);
                });
            }
          },
        });
      } else {
        // Update existing match
        await playoffUpdater.updateMatch(editingMatch.matchId, matchData, {
          onSuccess,
          onError,
          onTournamentUpdate,
          onMatchUpdate,
        });
      }
      
      setEditingMatch(null);
      setEditingBracketMatchId(null);
    } catch (error) {
      // Error is already handled by the PlayoffMatchUpdater callbacks
    }
  };

  const handleCancel = () => {
    setEditingMatch(null);
    setEditingBracketMatchId(null);
  };

  const handleClearMatch = async () => {
    if (!editingMatch || editingMatch.matchId === 0) return;

    try {
      await playoffUpdater.deleteMatch(editingMatch.matchId, {
        onSuccess,
        onError,
        onTournamentUpdate,
        onMatchUpdate,
        onBracketUpdate: () => {
          // Refresh tournament data to update bracket display
          if (onTournamentUpdate) {
            fetch(`/api/tournaments/${tournament.id}`)
              .then(res => res.json())
              .then(updatedTournament => {
                onTournamentUpdate(updatedTournament);
              })
              .catch(err => {
                console.error('Failed to refresh tournament:', err);
              });
          }
        },
      });
      
      setEditingMatch(null);
      setEditingBracketMatchId(null);
    } catch (error) {
      // Error is already handled by the PlayoffMatchUpdater callbacks
    }
  };

  return (
    <div className="playoff-active">
      <TraditionalBracket
        tournamentId={tournament.id}
        tournamentType={tournament.type}
        participants={tournament.participants.map(p => ({
          id: p.memberId,
          member: {
            id: p.member.id,
            firstName: p.member.firstName,
            lastName: p.member.lastName,
            rating: p.member.rating,
            birthDate: p.member.birthDate,
            isActive: p.member.isActive
          },
          playerRatingAtTime: p.playerRatingAtTime
        }))}
        matches={(tournament.bracketMatches || []).map(bm => ({
          id: bm.id,
          round: bm.round,
          position: bm.position,
          player1Id: bm.member1Id || null,
          player2Id: bm.member2Id || null,
          player1IsBye: !bm.member1Id,
          player2IsBye: !bm.member2Id,
          matchId: bm.match?.id || undefined,
          winnerId: undefined, // Not available in Match interface
          nextMatchId: bm.nextMatchId || undefined,
          player1Sets: bm.match?.player1Sets,
          player2Sets: bm.match?.player2Sets,
          player1Forfeit: bm.match?.player1Forfeit,
          player2Forfeit: bm.match?.player2Forfeit,
          player1RatingAtTime: bm.match?.player1RatingBefore ?? null,
          player2RatingAtTime: bm.match?.player2RatingBefore ?? null,
          match: bm.match ? {
            id: bm.match.id,
            player1RatingBefore: bm.match.player1RatingBefore ?? null,
            player1RatingChange: bm.match.player1RatingChange ?? null,
            player2RatingBefore: bm.match.player2RatingBefore ?? null,
            player2RatingChange: bm.match.player2RatingChange ?? null,
          } : null,
        }))}
        onMatchUpdate={() => onMatchUpdate && onMatchUpdate({} as any)}
        isReadOnly={tournament.status === 'COMPLETED'}
        tournamentStatus={tournament.status as 'ACTIVE' | 'COMPLETED'}
      />
      
      {editingMatch && (
        <MatchEntryPopup
          editingMatch={editingMatch}
          player1={tournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member!}
          player2={tournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member!}
          tournamentType="PLAYOFF"
          onSetEditingMatch={handleSetEditingMatch}
          onSave={handleSaveMatchEdit}
          onCancel={handleCancel}
          onClear={handleClearMatch}
          showClearButton={editingMatch.matchId !== 0}
        />
      )}
    </div>
  );
};
