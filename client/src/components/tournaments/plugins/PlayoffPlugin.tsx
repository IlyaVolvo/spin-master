import React from 'react';
import { TournamentPlugin, TournamentType, TournamentSetupProps, TournamentActiveProps, TournamentScheduleProps, TournamentCompletedProps } from '../../../types/tournament';
import { PlayoffSetupPanel } from './PlayoffSetupPanel';
import { PlayoffActivePanel } from './PlayoffActivePanel';
import { PlayoffSchedulePanel } from './PlayoffSchedulePanel';
import { PlayoffCompletedPanel } from './PlayoffCompletedPanel';

export const PlayoffPlugin: TournamentPlugin = {
  type: TournamentType.PLAYOFF,
  isBasic: true,
  name: 'Playoff/Bracket',
  description: 'Single or double elimination tournament bracket',

  createSetupPanel: (props: TournamentSetupProps) => (
    <PlayoffSetupPanel {...props} />
  ),

  validateSetup: (data: any) => {
    if (!data.name || data.name.trim().length === 0) {
      return 'Tournament name is required';
    }
    
    if (!data.participants || data.participants.length < 2) {
      return 'At least 2 participants are required for Playoff tournament';
    }

    if (data.participants.length > 64) {
      return 'Playoff tournament cannot have more than 64 participants';
    }

    // Validate bracket size
    const validSizes = [2, 4, 8, 16, 32, 64];
    if (!validSizes.includes(data.bracketSize)) {
      return 'Bracket size must be a power of 2 (2, 4, 8, 16, 32, or 64)';
    }

    if (data.participants.length > data.bracketSize) {
      return 'Number of participants cannot exceed bracket size';
    }

    return null;
  },

  createTournament: async (data: any) => {
    const response = await fetch('/api/tournaments/playoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        participantIds: data.participants.map((p: any) => p.id),
        bracketSize: data.bracketSize,
        isDoubleElimination: data.isDoubleElimination || false,
        seedByRating: data.seedByRating || false,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create Playoff tournament');
    }

    return response.json();
  },

  createActivePanel: (props: TournamentActiveProps) => (
    <PlayoffActivePanel {...props} />
  ),

  createSchedulePanel: (props: TournamentScheduleProps) => (
    <PlayoffSchedulePanel {...props} />
  ),

  createCompletedPanel: (props: TournamentCompletedProps) => (
    <PlayoffCompletedPanel {...props} />
  ),

  canPrintResults: true,
};
