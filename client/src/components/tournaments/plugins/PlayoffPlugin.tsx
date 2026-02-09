import React from 'react';
import { TournamentPlugin, TournamentType, TournamentSetupProps, TournamentActiveProps, TournamentScheduleProps, TournamentCompletedProps } from '../../../types/tournament';
import { PlayoffSetupPanel } from './PlayoffSetupPanel';
import { PlayoffActivePanel } from './PlayoffActivePanel';
import { PlayoffSchedulePanel } from './PlayoffSchedulePanel';
import { PlayoffCompletedPanel } from './PlayoffCompletedPanel';

export const PlayoffPlugin: TournamentPlugin = {
  type: 'PLAYOFF',
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

  // Tournament-specific calculations
  calculateExpectedMatches: (tournament) => {
    // Playoff (single elimination): numParticipants - 1 matches
    // Each match eliminates one player, need to eliminate all but one
    return tournament.participants.length - 1;
  },

  countPlayedMatches: (tournament) => {
    // For playoff, count matches that have winners (or forfeits)
    return tournament.matches.filter(match => {
      const hasWinner = match.player1Sets > match.player2Sets || match.player2Sets > match.player1Sets;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasWinner || hasForfeit;
    }).length;
  },

  countNonForfeitedMatches: (tournament) => {
    // For playoff, count matches that have been played (have a winner or forfeit)
    return tournament.matches.filter(match => {
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      return hasForfeit || hasScore;
    }).length;
  },

  areAllMatchesPlayed: (tournament) => {
    const expectedMatches = tournament.participants.length - 1;
    // For playoff, check if all matches have winners (or forfeits)
    const playedMatches = tournament.matches.filter(match => {
      const hasWinner = match.player1Sets > match.player2Sets || match.player2Sets > match.player1Sets;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasWinner || hasForfeit;
    }).length;
    return tournament.matches.length >= expectedMatches && playedMatches >= expectedMatches;
  },

  canDeleteTournament: (tournament) => {
    // Playoff tournaments with matches should be cancelled, not deleted
    return tournament.matches.length === 0;
  },

  getDeleteConfirmationMessage: (tournament) => {
    if (tournament.matches.length > 0) {
      return 'Cancel Tournament: This will move the tournament to Completed state. All completed matches will be kept and recorded. All completed matches will affect players\' ratings. The tournament will show "NOT COMPLETED" instead of a champion name.';
    }
    return 'Delete Tournament: Permanently removes the tournament and all its data. This action cannot be undone.';
  },

  canPrintResults: true,
};
