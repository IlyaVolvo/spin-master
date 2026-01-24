import React from 'react';
import { TournamentPlugin, TournamentType, TournamentSetupProps, TournamentActiveProps, TournamentScheduleProps, TournamentCompletedProps } from '../../../types/tournament';
import { RoundRobinSetupPanel } from './RoundRobinSetupPanel';
import { RoundRobinActivePanel } from './RoundRobinActivePanel';
import { RoundRobinSchedulePanel } from './RoundRobinSchedulePanel';
import { RoundRobinCompletedPanel } from './RoundRobinCompletedPanel';

export const RoundRobinPlugin: TournamentPlugin = {
  type: TournamentType.ROUND_ROBIN,
  isBasic: true,
  name: 'Round Robin',
  description: 'All players play against each other in a complete cycle',

  createSetupPanel: (props: TournamentSetupProps) => (
    <RoundRobinSetupPanel {...props} />
  ),

  validateSetup: (data: any) => {
    if (!data.name || data.name.trim().length === 0) {
      return 'Tournament name is required';
    }
    
    if (!data.participants || data.participants.length < 2) {
      return 'At least 2 participants are required for Round Robin tournament';
    }

    if (data.participants.length > 100) {
      return 'Round Robin tournament cannot have more than 100 participants';
    }

    return null;
  },

  createTournament: async (data: any) => {
    const response = await fetch('/api/tournaments/round-robin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        participantIds: data.participants.map((p: any) => p.id),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create Round Robin tournament');
    }

    return response.json();
  },

  createActivePanel: (props: TournamentActiveProps) => (
    <RoundRobinActivePanel {...props} />
  ),

  createSchedulePanel: (props: TournamentScheduleProps) => (
    <RoundRobinSchedulePanel {...props} />
  ),

  createCompletedPanel: (props: TournamentCompletedProps) => (
    <RoundRobinCompletedPanel {...props} />
  ),

  canPrintResults: true,
};
