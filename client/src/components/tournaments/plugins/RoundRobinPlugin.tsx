import React from 'react';
import { TournamentPlugin, TournamentType, TournamentSetupProps, TournamentActiveProps, TournamentScheduleProps, TournamentCompletedProps, TournamentCreationFlow } from '../../../types/tournament';
import { RoundRobinSetupPanel } from './RoundRobinSetupPanel';
import { RoundRobinActivePanel } from './RoundRobinActivePanel';
import { RoundRobinSchedulePanel } from './RoundRobinSchedulePanel';
import { RoundRobinCompletedPanel } from './RoundRobinCompletedPanel';
import { RoundRobinPostSelectionFlow } from './RoundRobinPostSelectionFlow';
import { generateRoundRobinSchedule, calculateStandings, buildResultsMatrix, calculatePlayerStats } from './roundRobinUtils';
import { getSystemConfig } from '../../../utils/systemConfig';

// Re-export utility functions for use in other components
export { generateRoundRobinSchedule, calculateStandings, buildResultsMatrix, calculatePlayerStats } from './roundRobinUtils';

export const RoundRobinPlugin: TournamentPlugin = {
  type: 'ROUND_ROBIN',
  isBasic: true,
  name: 'Round Robin',
  description: 'All players play against each other in a complete cycle',

  getCreationFlow: (): TournamentCreationFlow => ({
    minPlayers: getSystemConfig().tournamentRules.roundRobin.minPlayers,
    maxPlayers: getSystemConfig().tournamentRules.roundRobin.maxPlayers,
    steps: [],
    renderPostSelectionFlow: (props) => <RoundRobinPostSelectionFlow {...props} />,
  }),

  createSetupPanel: (props: TournamentSetupProps) => (
    <RoundRobinSetupPanel {...props} />
  ),

  validateSetup: (data: any) => {
    if (!data.name || data.name.trim().length === 0) {
      return 'Tournament name is required';
    }
    
    const rules = getSystemConfig().tournamentRules.roundRobin;
    if (!data.participants || data.participants.length < rules.minPlayers) {
      return `At least ${rules.minPlayers} participants are required for Round Robin tournament`;
    }

    if (data.participants.length > rules.maxPlayers) {
      return `Round Robin tournament cannot have more than ${rules.maxPlayers} participants`;
    }

    return null;
  },

  createTournament: async (data: any) => {
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        type: 'ROUND_ROBIN',
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

  // Tournament-specific calculations
  calculateExpectedMatches: (tournament) => {
    // Round Robin: n * (n-1) / 2 matches (each pair plays once)
    const n = tournament.participants.length;
    return (n * (n - 1)) / 2;
  },

  countPlayedMatches: (tournament) => {
    // For round robin, count matches that have been played (have scores or forfeits)
    return tournament.matches.filter(match => {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasScore || hasForfeit;
    }).length;
  },

  countNonForfeitedMatches: (tournament) => {
    // Count matches that were actually played (not forfeited)
    return tournament.matches.filter(match => {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const notForfeited = !match.player1Forfeit && !match.player2Forfeit;
      return hasScore && notForfeited;
    }).length;
  },

  areAllMatchesPlayed: (tournament) => {
    const n = tournament.participants.length;
    const expectedMatches = (n * (n - 1)) / 2;
    const playedMatches = tournament.matches.filter(match => {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasScore || hasForfeit;
    }).length;
    return playedMatches >= expectedMatches;
  },

  // Schedule generation
  generateSchedule: (tournament) => {
    return generateRoundRobinSchedule(tournament);
  },

  canPrintResults: true,
};

export default RoundRobinPlugin;
