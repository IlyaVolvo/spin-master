import React, { useState, useEffect } from 'react';
import { PanelConfig } from '../../types/tournament';
import { PanelManager } from '../panels/PanelManager';
import { PlayerFilterPanel } from './PlayerFilterPanel';
import { PlayerListPanel } from './PlayerListPanel';
import { TournamentCreationPanel } from './TournamentCreationPanel';
import { ActionPanel } from './ActionPanel';
import { usePanelManager } from '../panels/PanelManager';

export const PlayersTab: React.FC = () => {
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  
  const { panels, showPanel, hidePanel, expandPanel, collapsePanel } = usePanelManager([
    {
      id: 'actions',
      title: 'Actions',
      visible: true,
      expanded: true,
      render: () => (
        <ActionPanel
          onCreateTournament={() => setIsCreatingTournament(true)}
          selectedPlayersCount={selectedPlayers.length}
          disabled={isCreatingTournament}
        />
      )
    },
    {
      id: 'filters',
      title: 'Player Filters',
      visible: !isCreatingTournament,
      expanded: true,
      render: () => <PlayerFilterPanel />
    },
    {
      id: 'players',
      title: 'Players',
      visible: !isCreatingTournament,
      expanded: true,
      render: () => (
        <PlayerListPanel
          selectedPlayers={selectedPlayers}
          onSelectionChange={setSelectedPlayers}
          disabled={isCreatingTournament}
        />
      )
    },
    {
      id: 'tournament-creation',
      title: 'Create Tournament',
      visible: isCreatingTournament,
      expanded: true,
      render: () => (
        <TournamentCreationPanel
          selectedPlayers={selectedPlayers}
          onComplete={() => {
            setIsCreatingTournament(false);
            setSelectedPlayers([]);
          }}
          onCancel={() => {
            setIsCreatingTournament(false);
          }}
        />
      )
    }
  ]);

  // Update panel visibility when tournament creation state changes
  useEffect(() => {
    if (isCreatingTournament) {
      hidePanel('filters');
      hidePanel('players');
      showPanel('tournament-creation');
    } else {
      showPanel('filters');
      showPanel('players');
      hidePanel('tournament-creation');
    }
  }, [isCreatingTournament, showPanel, hidePanel]);

  return (
    <div className="players-tab">
      <PanelManager initialPanels={panels} />
    </div>
  );
};

export default PlayersTab;
