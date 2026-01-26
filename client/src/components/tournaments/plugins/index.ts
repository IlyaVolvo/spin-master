import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import { TournamentType } from '../../../types/tournament';
import { PlayoffPlugin } from './PlayoffPlugin';
import { RoundRobinPlugin } from './RoundRobinPlugin';
import { SwissPlugin } from './SwissPlugin';
import { PreliminaryWithFinalPlayoffPlugin } from './PreliminaryWithFinalPlayoffPlugin';
import { PreliminaryWithFinalRoundRobinPlugin } from './PreliminaryWithFinalRoundRobinPlugin';

// Register all tournament plugins
export function registerTournamentPlugins() {
  // Register basic tournament plugins
  tournamentPluginRegistry.register(PlayoffPlugin);
  tournamentPluginRegistry.register(RoundRobinPlugin);
  tournamentPluginRegistry.register(SwissPlugin);
  
  // Register compound tournament plugins
  tournamentPluginRegistry.register(PreliminaryWithFinalPlayoffPlugin);
  tournamentPluginRegistry.register(PreliminaryWithFinalRoundRobinPlugin);
}

// Auto-register plugins when this module is imported
registerTournamentPlugins();

// Export available tournament types for reference
export const AVAILABLE_TOURNAMENT_TYPES = [
  TournamentType.ROUND_ROBIN,
  TournamentType.PLAYOFF,
  TournamentType.SWISS,
  TournamentType.PRELIMINARY_WITH_FINAL_PLAYOFF,
  TournamentType.PRELIMINARY_WITH_FINAL_ROUND_ROBIN,
];

// Export function to check if a tournament type is supported
export function isTournamentTypeSupported(type: TournamentType): boolean {
  return tournamentPluginRegistry.isRegistered(type);
}

// Export function to get all supported tournament types
export function getSupportedTournamentTypes(): TournamentType[] {
  return tournamentPluginRegistry.getTypes();
}
