import React from 'react';
import type {
  Tournament,
  TournamentPlugin,
  TournamentSetupProps,
  TournamentActiveProps,
  TournamentScheduleProps,
  TournamentCompletedProps,
  TournamentCreationFlow,
} from '../../../types/tournament';

const PlaceholderPanel: React.FC = () => {
  return <div />;
};

export const MultiRoundRobinsPlugin: TournamentPlugin = {
  type: 'MULTI_ROUND_ROBINS',
  isBasic: false,
  name: 'Multi Round Robin',
  description: 'Split players into multiple round-robin groups and create one tournament per group',

  getCreationFlow: (): TournamentCreationFlow => ({
    minPlayers: 12,
    maxPlayers: -1,
    steps: [],
  }),

  createSetupPanel: (_props: TournamentSetupProps) => <PlaceholderPanel />,

  validateSetup: (_data: any) => {
    return null;
  },

  createTournament: async (data: any): Promise<Tournament> => {
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        type: 'MULTI_ROUND_ROBINS',
        participantIds: (data.participants || []).map((p: any) => p.id),
        additionalData: {
          groups: data.groups,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create Multi Round Robin tournament');
    }

    return response.json();
  },

  createActivePanel: (_props: TournamentActiveProps) => <PlaceholderPanel />,

  createSchedulePanel: (_props: TournamentScheduleProps) => <PlaceholderPanel />,

  createCompletedPanel: (_props: TournamentCompletedProps) => <PlaceholderPanel />,

  canPrintResults: false,
};

export default MultiRoundRobinsPlugin;
