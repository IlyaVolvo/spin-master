import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import { TournamentPlugin, TournamentType } from '../../../types/tournament';

// Auto-discover all *Plugin.tsx files in this directory via Vite's import.meta.glob.
// Each plugin file must have a `export default <plugin>` that satisfies TournamentPlugin.
// Adding a new plugin is as simple as creating a new *Plugin.tsx file with a default export.
const pluginModules = import.meta.glob<{ default: TournamentPlugin }>('./*Plugin.tsx', { eager: true });

for (const [path, module] of Object.entries(pluginModules)) {
  const plugin = module.default;
  if (plugin && plugin.type && plugin.name) {
    tournamentPluginRegistry.register(plugin);
  } else {
    console.warn(`⚠️ Skipping plugin at ${path}: missing default export or required fields (type, name)`);
  }
}

// Log registration status
console.group('🏓 Tournament Plugin Registry');
const all = tournamentPluginRegistry.getAll();
console.log(`${all.length} plugins registered`);
all.forEach(p => {
  const icon = p.isBasic ? '📊' : '🔗';
  console.log(`  ${icon} ${p.name} (${p.type})`);
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
