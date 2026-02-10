import React from 'react';
import { TournamentPlugin, TournamentType, TournamentSetupProps, TournamentActiveProps, TournamentScheduleProps, TournamentCompletedProps, SwissTournamentData } from '../../../types/tournament';
import { SwissSetupPanel } from './SwissSetupPanel.tsx';
import { SwissActivePanel } from './SwissActivePanel';
import { SwissSchedulePanel } from './SwissSchedulePanel';
import { SwissCompletedPanel } from './SwissCompletedPanel';

// Swiss icon component
const SwissIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7V12C2 16.5 4.23 20.68 7.62 23.15L12 24L16.38 23.15C19.77 20.68 22 16.5 22 12V7L12 2Z" 
          stroke={color} strokeWidth="2" fill="none"/>
    <path d="M8 12L11 15L16 9" stroke={color} strokeWidth="2" fill="none"/>
  </svg>
);

export const SwissPlugin: TournamentPlugin = {
  type: 'SWISS',
  isBasic: true,
  name: 'Swiss System',
  description: 'Swiss tournament with progressive pairings based on performance',
  icon: SwissIcon,

  createSetupPanel: (props: TournamentSetupProps) => (
    <SwissSetupPanel {...props} />
  ),

  validateSetup: (data: any) => {
    if (!data.name || data.name.trim().length === 0) {
      return 'Tournament name is required';
    }
    
    if (!data.participants || data.participants.length < 6) {
      return 'Swiss tournament requires at least 6 participants for meaningful pairings';
    }

    if (data.participants.length > 200) {
      return 'Swiss tournament cannot have more than 200 participants';
    }

    if (!data.numberOfRounds || data.numberOfRounds < 1) {
      return 'Number of rounds must be at least 1';
    }

    const maxRounds = Math.floor(data.participants.length / 2);
    if (data.numberOfRounds > maxRounds) {
      return `Number of rounds cannot exceed ${maxRounds} (50% of participants)`;
    }

    // For Swiss tournaments, we don't require even participants
    // The system will handle odd numbers with byes or appropriate pairing

    return null;
  },

  createTournament: async (data: any) => {
    const response = await fetch('/api/tournaments/swiss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        participantIds: data.participants.map((p: any) => p.id),
        numberOfRounds: data.numberOfRounds,
        pairByRating: data.pairByRating || true,
        // Swiss-specific data that will be stored in SwissTournamentData table
        swissData: {
          numberOfRounds: data.numberOfRounds,
          pairByRating: data.pairByRating || true,
          currentRound: 1,
          isCompleted: false
        } as SwissTournamentData
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create Swiss tournament');
    }

    return response.json();
  },

  createActivePanel: (props: TournamentActiveProps) => (
    <SwissActivePanel {...props} />
  ),

  createSchedulePanel: (props: TournamentScheduleProps) => (
    <SwissSchedulePanel {...props} />
  ),

  createCompletedPanel: (props: TournamentCompletedProps) => (
    <SwissCompletedPanel {...props} />
  ),

  canPrintResults: true,
};

export default SwissPlugin;
