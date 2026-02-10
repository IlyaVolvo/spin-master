import React from 'react';
import { TournamentPlugin, Tournament } from '../../../types/tournament';
import { PlayoffActivePanel } from './PlayoffActivePanel';
import { PlayoffCompletedPanel } from './PlayoffCompletedPanel';
import { PlayoffSchedulePanel } from './PlayoffSchedulePanel';

export const PlayoffPlugin: TournamentPlugin = {
  type: 'PLAYOFF',
  isBasic: true,
  name: 'Playoff',
  description: 'Single-elimination tournament bracket with automatic winner advancement',
  
  createSetupPanel: (props) => {
    // Return playoff setup panel component
    return React.createElement('div', {}, 'Playoff Setup Panel');
  },
  
  validateSetup: (data) => {
    // Validate playoff setup data
    return null; // Return error message if invalid
  },
  
  createTournament: async (data) => {
    // Create playoff tournament
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type: 'PLAYOFF' })
    });
    return await response.json();
  },
  
  createActivePanel: (props) => {
    return React.createElement(PlayoffActivePanel, props);
  },
  
  createSchedulePanel: (props) => {
    return React.createElement(PlayoffSchedulePanel, props);
  },
  
  createCompletedPanel: (props) => {
    return React.createElement(PlayoffCompletedPanel, props);
  },
  
  canPrintResults: true,
  
  renderHeader: ({ tournament, onEditClick }) => {
    return React.createElement('div', {}, 
      React.createElement('h3', {}, tournament.name || 'Playoff Tournament'),
      React.createElement('button', { onClick: onEditClick }, 'Edit')
    );
  },
  
  // ============================================================================
  // DISPLAY NAME
  // ============================================================================
  // Returns human-readable tournament type name (for display only, no logic)
  
  getTypeName: (): string => {
    return 'Playoff';
  },

  // ============================================================================
  // TOURNAMENT CALCULATIONS
  // ============================================================================
  // Playoff specific calculations - eliminates type checking in main code
  
  calculateExpectedMatches: (tournament: Tournament): number => {
    // Playoff (single elimination): numParticipants - 1 matches
    // Each match eliminates one player, need to eliminate all but one
    return tournament.participants.length - 1;
  },

  countPlayedMatches: (tournament: Tournament): number => {
    return tournament.matches.filter(m => m.player1Sets > 0 || m.player2Sets > 0).length;
  },

  countNonForfeitedMatches: (tournament: Tournament): number => {
    return tournament.matches.filter(m => !m.player1Forfeit && !m.player2Forfeit).length;
  },

  areAllMatchesPlayed: (tournament: Tournament): boolean => {
    const expected = tournament.participants.length - 1;
    const played = tournament.matches.filter(m => !m.player1Forfeit && !m.player2Forfeit).length;
    return played >= expected;
  },

  canDeleteTournament: (tournament: Tournament): boolean => {
    // Playoff can always be cancelled (moved to completed) even with matches
    // But can only be truly deleted if no matches exist
    return tournament.matches.length === 0;
  },

  getDeleteConfirmationMessage: (tournament: Tournament): string => {
    if (tournament.matches.length > 0) {
      return 'Cancel tournament (moves to completed, keeps matches)';
    }
    return 'Delete tournament';
  },

  // ============================================================================
  // CANCELLATION HANDLING
  // ============================================================================
  // Playoff tournaments: keep all matches when cancelled (bracket may be incomplete)
  
  handleCancellation: async (tournament: Tournament): Promise<{ shouldKeepMatches: boolean; message?: string }> => {
    return {
      shouldKeepMatches: true,
      message: 'Playoff tournament cancelled. All matches will be kept for rating history.'
    };
  }
};
