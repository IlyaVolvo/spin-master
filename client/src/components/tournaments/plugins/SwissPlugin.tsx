import React from 'react';
import { TournamentPlugin, TournamentType, TournamentCreationFlow, TournamentSetupProps, TournamentActiveProps, TournamentCompletedProps, SwissTournamentData } from '../../../types/tournament';
import { SwissSetupPanel } from './SwissSetupPanel.tsx';
import { SwissActivePanel } from './SwissActivePanel';
import { SwissCompletedPanel } from './SwissCompletedPanel';
import { SwissPostSelectionFlow } from './SwissPostSelectionFlow';
import { calculateSwissDefaultRounds, getSystemConfig } from '../../../utils/systemConfig';

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

  getCreationFlow: (): TournamentCreationFlow => ({
    minPlayers: getSystemConfig().tournamentRules.swiss.minPlayers,
    maxPlayers: -1,
    steps: [],
    renderPostSelectionFlow: (props) => (
      <SwissPostSelectionFlow {...props} />
    ),
  }),

  createSetupPanel: (props: TournamentSetupProps) => (
    <SwissSetupPanel {...props} />
  ),

  validateSetup: (data: any) => {
    if (!data.name || data.name.trim().length === 0) {
      return 'Tournament name is required';
    }
    
    const rules = getSystemConfig().tournamentRules.swiss;
    if (!data.participants || data.participants.length < rules.minPlayers) {
      return `Swiss tournament requires at least ${rules.minPlayers} participants for meaningful pairings`;
    }

    if (data.participants.length > 200) {
      return 'Swiss tournament cannot have more than 200 participants';
    }

    if (!data.numberOfRounds || data.numberOfRounds < 3) {
      return 'Number of rounds must be at least 3';
    }

    const maxRounds = Math.floor(data.participants.length / rules.maxRoundsDivisor);
    if (data.numberOfRounds > maxRounds) {
      return `Number of rounds cannot exceed ${maxRounds}`;
    }

    // For Swiss tournaments, we don't require even participants
    // The system will handle odd numbers with byes or appropriate pairing

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
        type: 'SWISS',
        participantIds: data.participants.map((p: any) => p.id),
        additionalData: {
          numberOfRounds: data.numberOfRounds,
        },
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

  createCompletedPanel: (props: TournamentCompletedProps) => (
    <SwissCompletedPanel {...props} />
  ),

  canPrintResults: true,

  calculateExpectedMatches: (tournament) => {
    const swissData = (tournament as any).swissData;
    const participantCount = tournament.participants.length;
    const swissRules = getSystemConfig().tournamentRules.swiss;
    const numberOfRounds = swissData?.numberOfRounds
      ?? calculateSwissDefaultRounds(participantCount, swissRules.maxRoundsDivisor);
    return numberOfRounds * Math.floor(participantCount / 2);
  },

  countPlayedMatches: (tournament) => {
    return tournament.matches.filter(match => {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      return hasScore || hasForfeit;
    }).length;
  },

  countNonForfeitedMatches: (tournament) => {
    return tournament.matches.filter(match => {
      const hasScore = match.player1Sets > 0 || match.player2Sets > 0;
      const notForfeited = !match.player1Forfeit && !match.player2Forfeit;
      return hasScore && notForfeited;
    }).length;
  },
};

export default SwissPlugin;
