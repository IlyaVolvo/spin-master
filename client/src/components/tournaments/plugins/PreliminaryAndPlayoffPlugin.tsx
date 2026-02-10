import React from 'react';
import type {
  TournamentPlugin,
  TournamentSetupProps,
  TournamentActiveProps,
  TournamentScheduleProps,
  TournamentCompletedProps,
  TournamentCreationFlow,
} from '../../../types/tournament';
import { PreliminaryAndPlayoffPostSelectionFlow } from './PreliminaryAndPlayoffPostSelectionFlow';

const PlaceholderPanel: React.FC = () => {
  return <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Not yet implemented for this tournament type.</div>;
};

export const PreliminaryAndPlayoffPlugin: TournamentPlugin = {
  type: 'PRELIMINARY_AND_PLAYOFF',
  isBasic: false,
  name: 'Preliminary + Playoff',
  description: 'Round Robin groups followed by a playoff bracket for top players',

  getCreationFlow: (): TournamentCreationFlow => ({
    minPlayers: 6,
    steps: [],
    renderPostSelectionFlow: (props) => (
      <PreliminaryAndPlayoffPostSelectionFlow {...props} />
    ),
  }),

  createSetupPanel: (_props: TournamentSetupProps) => <PlaceholderPanel />,

  validateSetup: (_data: any) => {
    return null;
  },

  createTournament: async (_data: any) => {
    throw new Error('PRELIMINARY_AND_PLAYOFF tournaments are created via the post-selection flow');
  },

  createActivePanel: (_props: TournamentActiveProps) => <PlaceholderPanel />,

  createSchedulePanel: (_props: TournamentScheduleProps) => <PlaceholderPanel />,

  createCompletedPanel: (_props: TournamentCompletedProps) => <PlaceholderPanel />,
};

export default PreliminaryAndPlayoffPlugin;
