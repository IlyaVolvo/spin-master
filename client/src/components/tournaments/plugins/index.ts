import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import { TournamentType } from '../../../types/tournament';
import { PlayoffPlugin } from './PlayoffPlugin.tsx';
import { RoundRobinPlugin } from './RoundRobinPlugin.tsx';
import { SwissPlugin } from './SwissPlugin.tsx';
import { MultiRoundRobinsPlugin } from './MultiRoundRobinsPlugin.tsx';
import { PreliminaryWithFinalPlayoffPlugin } from './PreliminaryWithFinalPlayoffPlugin';
import { PreliminaryWithFinalRoundRobinPlugin } from './PreliminaryWithFinalRoundRobinPlugin';

// Register all tournament plugins
export function registerTournamentPlugins() {
  // Register basic tournament plugins
  tournamentPluginRegistry.register(PlayoffPlugin);
  tournamentPluginRegistry.register(RoundRobinPlugin);
  tournamentPluginRegistry.register(SwissPlugin);
  tournamentPluginRegistry.register(MultiRoundRobinsPlugin);
  
  // Register compound tournament plugins
  tournamentPluginRegistry.register(PreliminaryWithFinalPlayoffPlugin);
  tournamentPluginRegistry.register(PreliminaryWithFinalRoundRobinPlugin);
}

// Auto-register plugins when this module is imported
registerTournamentPlugins();

// Print information about all registered tournaments
console.group('🏓 Tournament Plugin Registry Status');
console.log(`⏰ Initialized at: ${new Date().toLocaleTimeString()}`);

const registeredPlugins = tournamentPluginRegistry.getAll();
const basicPlugins = tournamentPluginRegistry.getBasic();
const compoundPlugins = tournamentPluginRegistry.getCompound();

console.log(`✅ Total registered plugins: ${registeredPlugins.length}`);
console.log(`📊 Basic tournaments: ${basicPlugins.length}`);
console.log(`🔗 Compound tournaments: ${compoundPlugins.length}`);

console.log('\n📋 Registered Tournament Types:');
registeredPlugins.forEach((plugin, index) => {
  const icon = plugin.isBasic ? '📊' : '🔗';
  console.log(`${icon} ${plugin.name} (${plugin.type})`);
  console.log(`   └─ ${plugin.description}`);
});

console.log('\n🎯 Available Tournament Types:');
const availableTypes = tournamentPluginRegistry.getTypes();
availableTypes.forEach(type => {
  const plugin = tournamentPluginRegistry.get(type);
  const icon = plugin?.isBasic ? '📊' : '🔗';
  const name = plugin?.name || 'Unknown';
  console.log(`${icon} ${type} - ${name}`);
});

console.groupEnd();

// Export function to check if a tournament type is supported
export function isTournamentTypeSupported(type: TournamentType): boolean {
  return tournamentPluginRegistry.isRegistered(type);
}

// Export function to get all supported tournament types
export function getSupportedTournamentTypes(): TournamentType[] {
  return tournamentPluginRegistry.getTypes();
}
