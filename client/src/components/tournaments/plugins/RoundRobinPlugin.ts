import React from 'react';
import { TournamentPlugin } from './TournamentPluginFactory';
import { TournamentActiveProps, Tournament } from '../../../types/tournament';
import { RoundRobinActivePanel } from './RoundRobinActivePanel';
import { RoundRobinCompletedPanel } from './RoundRobinCompletedPanel';
import { RoundRobinSchedulePanel } from './RoundRobinSchedulePanel';
import { createRoundRobinMatchUpdater } from '../utils/roundRobinMatchUpdater';

export class RoundRobinPlugin implements TournamentPlugin {
  async createMatch(matchData: any, callbacks?: any): Promise<any> {
    const updater = createRoundRobinMatchUpdater(matchData.tournamentId);
    return await updater.createMatch(matchData, callbacks);
  }

  async updateMatch(matchId: number, matchData: any, callbacks?: any): Promise<any> {
    const updater = createRoundRobinMatchUpdater(matchData.tournamentId);
    return await updater.updateMatch(matchId, matchData, callbacks);
  }

  async deleteMatch(matchId: number, callbacks?: any): Promise<void> {
    const updater = createRoundRobinMatchUpdater(callbacks?.tournamentId);
    return await updater.deleteMatch(matchId, callbacks);
  }

  async completeTournament(tournamentId: number): Promise<void> {
    // Tournament completion is handled automatically by the plugin API
    // when all matches are played
  }

  async cancelTournament(tournamentId: number): Promise<void> {
    // Implementation for cancelling round robin tournaments
  }

  // ============================================================================
  // DISPLAY NAME
  // ============================================================================
  // Returns human-readable tournament type name (for display only, no logic)
  
  getTypeName(): string {
    return 'Round Robin';
  }

  // ============================================================================
  // TOURNAMENT CALCULATIONS
  // ============================================================================
  // Round Robin specific calculations - eliminates type checking in main code
  
  calculateExpectedMatches(tournament: Tournament): number {
    // Round-robin: each player plays every other player once
    // Formula: n * (n - 1) / 2
    const n = tournament.participants.length;
    return n * (n - 1) / 2;
  }

  countPlayedMatches(tournament: Tournament): number {
    return tournament.matches.filter(m => m.player1Sets > 0 || m.player2Sets > 0).length;
  }

  countNonForfeitedMatches(tournament: Tournament): number {
    return tournament.matches.filter(m => !m.player1Forfeit && !m.player2Forfeit).length;
  }

  areAllMatchesPlayed(tournament: Tournament): boolean {
    const expected = this.calculateExpectedMatches(tournament);
    const played = this.countNonForfeitedMatches(tournament);
    return played >= expected;
  }

  ActivePanel = RoundRobinActivePanel;
  CompletedPanel = RoundRobinCompletedPanel;
  SchedulePanel = RoundRobinSchedulePanel;
}
