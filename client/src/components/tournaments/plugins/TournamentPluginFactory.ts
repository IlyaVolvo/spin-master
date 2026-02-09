import { TournamentActiveProps } from '../../../types/tournament';

export interface TournamentPlugin {
  // Basic tournament operations
  createMatch?(matchData: any, callbacks?: any): Promise<any>;
  updateMatch?(matchId: number, matchData: any, callbacks?: any): Promise<any>;
  deleteMatch?(matchId: number, callbacks?: any): Promise<void>;
  
  // Tournament lifecycle
  completeTournament?(tournamentId: number): Promise<void>;
  cancelTournament?(tournamentId: number): Promise<void>;
  
  // UI components
  ActivePanel?: React.ComponentType<TournamentActiveProps>;
  CompletedPanel?: React.ComponentType<any>;
  SchedulePanel?: React.ComponentType<any>;
}

export class TournamentPluginFactory {
  private static plugins = new Map<string, () => Promise<TournamentPlugin>>();
  
  static register(tournamentType: string, pluginFactory: () => Promise<TournamentPlugin>) {
    this.plugins.set(tournamentType, pluginFactory);
  }
  
  static async create(tournamentType: string): Promise<TournamentPlugin> {
    const pluginFactory = this.plugins.get(tournamentType);
    if (!pluginFactory) {
      throw new Error(`No plugin registered for tournament type: ${tournamentType}`);
    }
    return await pluginFactory();
  }
  
  static getRegisteredTypes(): string[] {
    return Array.from(this.plugins.keys());
  }
}
