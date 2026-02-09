import { TournamentPlugin, TournamentType } from '../../types/tournament';

class TournamentPluginRegistry {
  private plugins: Map<TournamentType, TournamentPlugin> = new Map();

  register(plugin: TournamentPlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: TournamentType): TournamentPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(`No plugin registered for tournament type: ${type}`);
    }
    return plugin;
  }

  getAll(): TournamentPlugin[] {
    return Array.from(this.plugins.values());
  }

  getBasic(): TournamentPlugin[] {
    return this.getAll().filter(plugin => plugin.isBasic);
  }

  getCompound(): TournamentPlugin[] {
    return this.getAll().filter(plugin => !plugin.isBasic);
  }

  getTypes(): TournamentType[] {
    return Array.from(this.plugins.keys());
  }

  isRegistered(type: TournamentType): boolean {
    return this.plugins.has(type);
  }
}

// Global registry instance
export const tournamentPluginRegistry = new TournamentPluginRegistry();

// Hook for accessing the registry
export const useTournamentPlugins = () => {
  return {
    register: (plugin: TournamentPlugin) => tournamentPluginRegistry.register(plugin),
    get: (type: TournamentType) => tournamentPluginRegistry.get(type),
    getAll: () => tournamentPluginRegistry.getAll(),
    getBasic: () => tournamentPluginRegistry.getBasic(),
    getCompound: () => tournamentPluginRegistry.getCompound(),
    getTypes: () => tournamentPluginRegistry.getTypes(),
    isRegistered: (type: TournamentType) => tournamentPluginRegistry.isRegistered(type),
  };
};

export default TournamentPluginRegistry;
