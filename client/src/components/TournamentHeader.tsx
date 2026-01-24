import React from 'react';
import { TournamentType, TournamentStatus } from '../types/tournament';
import { useTournamentPlugins } from './tournaments/TournamentPluginRegistry';

interface Tournament {
  id: number;
  name: string | null;
  type?: TournamentType;
  createdAt: string;
  status: TournamentStatus;
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
  const { get } = useTournamentPlugins();
  
  // Get the plugin for this tournament type
  const plugin = tournament.type ? get(tournament.type) : null;

  // If plugin has custom header rendering, use it
  if (plugin && 'renderHeader' in plugin && typeof plugin.renderHeader === 'function' && tournament.type) {
    return plugin.renderHeader({ tournament: tournament as any, onEditClick });
  }

  // Default header rendering
  return (
    <>
      {plugin && (
        <span style={{ marginRight: '8px', opacity: 0.7, display: 'inline-flex', alignItems: 'center' }}>
          {plugin.icon && <plugin.icon size={20} color="#666" />}
        </span>
      )}
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

