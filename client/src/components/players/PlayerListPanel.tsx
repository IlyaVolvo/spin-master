import React from 'react';

export interface PlayerListPanelProps {
  selectedPlayers: number[];
  onSelectionChange: (ids: number[]) => void;
  disabled?: boolean;
}

/** Placeholder list — wire to members API when this tab is integrated. */
export const PlayerListPanel: React.FC<PlayerListPanelProps> = ({
  selectedPlayers,
  onSelectionChange,
  disabled = false,
}) => (
  <div className="players-tab__player-list">
    <p style={{ marginBottom: 8 }}>
      Selected IDs: {selectedPlayers.length ? selectedPlayers.join(', ') : 'none'}
    </p>
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectionChange(selectedPlayers.length ? [] : [1])}
    >
      Toggle sample selection
    </button>
  </div>
);
