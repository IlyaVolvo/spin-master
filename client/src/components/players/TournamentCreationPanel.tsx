import React from 'react';

export interface TournamentCreationPanelProps {
  selectedPlayers: number[];
  onComplete: () => void;
  onCancel: () => void;
}

/** Stub creation flow for the Players tab panel layout — extend with tournament type + API when wired. */
export const TournamentCreationPanel: React.FC<TournamentCreationPanelProps> = ({
  selectedPlayers,
  onComplete,
  onCancel,
}) => (
  <div className="players-tab__tournament-creation">
    <p style={{ marginBottom: 12 }}>
      Tournament creation (preview): {selectedPlayers.length} participant
      {selectedPlayers.length === 1 ? '' : 's'} selected.
    </p>
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" onClick={onComplete}>
        Done
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  </div>
);
