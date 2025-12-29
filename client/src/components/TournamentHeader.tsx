import React from 'react';
import { BracketIcon } from './BracketIcon';
import { TableIcon } from './TableIcon';
import { SingleMatchHeader } from './SingleMatchHeader';

interface Tournament {
  id: number;
  name: string | null;
  type?: 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH';
  createdAt: string;
  status: 'ACTIVE' | 'COMPLETED';
  participants: Array<{ member: { firstName: string; lastName: string } }>;
  matches: Array<{ member1Id: number; member2Id: number | null; player1Sets: number; player2Sets: number }>;
}

interface TournamentHeaderProps {
  tournament: Tournament;
  onEditClick: () => void;
}

export const TournamentHeader: React.FC<TournamentHeaderProps> = ({
  tournament,
  onEditClick,
}) => {
  if (tournament.type === 'SINGLE_MATCH' && tournament.matches.length > 0) {
    return (
      <SingleMatchHeader
        participants={tournament.participants as any}
        match={tournament.matches[0]}
        isCompleted={tournament.status === 'COMPLETED'}
      />
    );
  }

  if (tournament.type === 'SINGLE_MATCH') {
    return null;
  }

  return (
    <>
      {tournament.type === 'PLAYOFF' ? (
        <span style={{ marginRight: '8px', opacity: 0.7, display: 'inline-flex', alignItems: 'center' }}>
          <BracketIcon size={20} color="#666" />
        </span>
      ) : tournament.type === 'ROUND_ROBIN' ? (
        <span style={{ marginRight: '8px', opacity: 0.7, display: 'inline-flex', alignItems: 'center' }}>
          <TableIcon size={20} color="#666" />
        </span>
      ) : null}
      <h4 style={{ margin: 0 }}>{tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`}</h4>
      <button
        onClick={onEditClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          fontSize: '14px',
          color: '#666',
          opacity: 0.7,
        }}
        title="Edit tournament name"
      >
        ✏️
      </button>
    </>
  );
};

