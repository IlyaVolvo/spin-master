import React from 'react';
import { TournamentActiveProps } from '../../../types/tournament';
import { TraditionalBracket } from '../../TraditionalBracket';
import './PlayoffActivePanel.css';

export const PlayoffActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const handleMatchUpdate = () => {
    // Refresh tournament data when matches are updated
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
  };

  return (
    <div className="playoff-active">
      <TraditionalBracket
        tournamentId={tournament.id}
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
        onMatchUpdate={handleMatchUpdate}
        isReadOnly={true} // Disable editing to prevent API errors
        tournamentStatus={tournament.status as 'ACTIVE' | 'COMPLETED'}
      />
    </div>
  );
};
