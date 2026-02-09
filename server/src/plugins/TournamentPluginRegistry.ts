import { TournamentPlugin } from './TournamentPlugin';
import { PlayoffPlugin } from './PlayoffPlugin';
import { RoundRobinPlugin } from './RoundRobinPlugin';
import { SwissPlugin } from './SwissPlugin';
import { PreliminaryWithFinalPlayoffPlugin } from './PreliminaryWithFinalPlayoffPlugin';
import { PreliminaryWithFinalRoundRobinPlugin } from './PreliminaryWithFinalRoundRobinPlugin';
import { MultiRoundRobinsPlugin } from './MultiRoundRobinsPlugin';

class TournamentPluginRegistry {
  private plugins: Map<string, TournamentPlugin> = new Map();

  constructor() {
    this.register(new PlayoffPlugin());
    this.register(new RoundRobinPlugin());
    this.register(new SwissPlugin());
    this.register(new MultiRoundRobinsPlugin());
    this.register(new PreliminaryWithFinalPlayoffPlugin());
    this.register(new PreliminaryWithFinalRoundRobinPlugin());
  }

  register(plugin: TournamentPlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string): TournamentPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(`No plugin registered for tournament type: ${type}`);
    }
    return plugin;
  }

  has(type: string): boolean {
    return this.plugins.has(type);
  }

  isRegistered(type: string): boolean {
    return this.plugins.has(type);
  }

  getTypes(): string[] {
    return Array.from(this.plugins.keys());
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
}

export const tournamentPluginRegistry = new TournamentPluginRegistry();
