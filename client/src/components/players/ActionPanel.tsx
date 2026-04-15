import React from 'react';

export interface ActionPanelProps {
  onCreateTournament: () => void;
  selectedPlayersCount: number;
  disabled?: boolean;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  onCreateTournament,
  selectedPlayersCount,
  disabled = false,
}) => (
  <div className="players-tab__action-panel">
    <p style={{ marginBottom: 8 }}>
      {selectedPlayersCount} player{selectedPlayersCount === 1 ? '' : 's'} selected
    </p>
    <button type="button" disabled={disabled} onClick={onCreateTournament}>
      Create tournament
    </button>
  </div>
);
