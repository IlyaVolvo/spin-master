import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { PlayoffBracket } from '../../PlayoffBracket';

export const PlayoffCompletedPanel: React.FC<TournamentCompletedProps> = ({
  tournament,
  isExpanded,
}) => {
  if (!isExpanded) {
    return null;
  }

  return (
    <div className="playoff-completed expanded">
      <PlayoffBracket
        tournamentId={tournament.id}
        participants={tournament.participants as any}
        matches={(tournament.bracketMatches || []) as any}
        isReadOnly={true}
        tournamentStatus="COMPLETED"
        cancelled={tournament.cancelled}
      />
    </div>
  );
};
