/**
 * TournamentPluginRegistry — Unit Tests
 *
 * Tests the plugin registry:
 * - register, get, has, isRegistered
 * - getTypes, getAll, getBasic, getCompound
 * - Error handling for unregistered types
 */

// Mock all plugin imports to avoid pulling in their dependencies
jest.mock('../../src/plugins/PlayoffPlugin', () => ({
  PlayoffPlugin: jest.fn().mockImplementation(() => ({ type: 'PLAYOFF', isBasic: true })),
}));
jest.mock('../../src/plugins/RoundRobinPlugin', () => ({
  RoundRobinPlugin: jest.fn().mockImplementation(() => ({ type: 'ROUND_ROBIN', isBasic: true })),
}));
jest.mock('../../src/plugins/SwissPlugin', () => ({
  SwissPlugin: jest.fn().mockImplementation(() => ({ type: 'SWISS', isBasic: true })),
}));
jest.mock('../../src/plugins/MultiRoundRobinsPlugin', () => ({
  MultiRoundRobinsPlugin: jest.fn().mockImplementation(() => ({ type: 'MULTI_ROUND_ROBINS', isBasic: false })),
}));
jest.mock('../../src/plugins/PreliminaryWithFinalPlayoffPlugin', () => ({
  PreliminaryWithFinalPlayoffPlugin: jest.fn().mockImplementation(() => ({ type: 'PRELIMINARY_WITH_FINAL_PLAYOFF', isBasic: false })),
}));
jest.mock('../../src/plugins/PreliminaryWithFinalRoundRobinPlugin', () => ({
  PreliminaryWithFinalRoundRobinPlugin: jest.fn().mockImplementation(() => ({ type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN', isBasic: false })),
}));

import { tournamentPluginRegistry } from '../../src/plugins/TournamentPluginRegistry';

// ─── Registration ─────────────────────────────────────────────────────────

describe('TournamentPluginRegistry', () => {
  describe('constructor auto-registration', () => {
    it('registers all 6 built-in plugin types', () => {
      const types = tournamentPluginRegistry.getTypes();
      expect(types).toHaveLength(6);
    });

    it('registers PLAYOFF', () => {
      expect(tournamentPluginRegistry.has('PLAYOFF')).toBe(true);
    });

    it('registers ROUND_ROBIN', () => {
      expect(tournamentPluginRegistry.has('ROUND_ROBIN')).toBe(true);
    });

    it('registers SWISS', () => {
      expect(tournamentPluginRegistry.has('SWISS')).toBe(true);
    });

    it('registers MULTI_ROUND_ROBINS', () => {
      expect(tournamentPluginRegistry.has('MULTI_ROUND_ROBINS')).toBe(true);
    });

    it('registers PRELIMINARY_WITH_FINAL_PLAYOFF', () => {
      expect(tournamentPluginRegistry.has('PRELIMINARY_WITH_FINAL_PLAYOFF')).toBe(true);
    });

    it('registers PRELIMINARY_WITH_FINAL_ROUND_ROBIN', () => {
      expect(tournamentPluginRegistry.has('PRELIMINARY_WITH_FINAL_ROUND_ROBIN')).toBe(true);
    });
  });

  describe('get', () => {
    it('returns plugin for registered type', () => {
      const plugin = tournamentPluginRegistry.get('PLAYOFF');
      expect(plugin).toBeDefined();
      expect(plugin.type).toBe('PLAYOFF');
    });

    it('throws for unregistered type', () => {
      expect(() => tournamentPluginRegistry.get('NONEXISTENT')).toThrow(
        'No plugin registered for tournament type: NONEXISTENT'
      );
    });

    it('throws for empty string', () => {
      expect(() => tournamentPluginRegistry.get('')).toThrow();
    });
  });

  describe('has / isRegistered', () => {
    it('returns true for registered types', () => {
      expect(tournamentPluginRegistry.has('ROUND_ROBIN')).toBe(true);
      expect(tournamentPluginRegistry.isRegistered('ROUND_ROBIN')).toBe(true);
    });

    it('returns false for unregistered types', () => {
      expect(tournamentPluginRegistry.has('NONEXISTENT')).toBe(false);
      expect(tournamentPluginRegistry.isRegistered('NONEXISTENT')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(tournamentPluginRegistry.has('playoff')).toBe(false);
      expect(tournamentPluginRegistry.has('Playoff')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all registered plugins', () => {
      const all = tournamentPluginRegistry.getAll();
      expect(all).toHaveLength(6);
    });

    it('each plugin has a type property', () => {
      const all = tournamentPluginRegistry.getAll();
      all.forEach(plugin => {
        expect(plugin.type).toBeDefined();
        expect(typeof plugin.type).toBe('string');
      });
    });
  });

  describe('getBasic', () => {
    it('returns only basic (non-compound) plugins', () => {
      const basic = tournamentPluginRegistry.getBasic();
      basic.forEach(plugin => {
        expect(plugin.isBasic).toBe(true);
      });
    });

    it('includes PLAYOFF, ROUND_ROBIN, SWISS', () => {
      const basicTypes = tournamentPluginRegistry.getBasic().map(p => p.type);
      expect(basicTypes).toContain('PLAYOFF');
      expect(basicTypes).toContain('ROUND_ROBIN');
      expect(basicTypes).toContain('SWISS');
    });
  });

  describe('getCompound', () => {
    it('returns only compound plugins', () => {
      const compound = tournamentPluginRegistry.getCompound();
      compound.forEach(plugin => {
        expect(plugin.isBasic).toBe(false);
      });
    });

    it('includes MULTI_ROUND_ROBINS, PRELIMINARY_WITH_FINAL_PLAYOFF, PRELIMINARY_WITH_FINAL_ROUND_ROBIN', () => {
      const compoundTypes = tournamentPluginRegistry.getCompound().map(p => p.type);
      expect(compoundTypes).toContain('MULTI_ROUND_ROBINS');
      expect(compoundTypes).toContain('PRELIMINARY_WITH_FINAL_PLAYOFF');
      expect(compoundTypes).toContain('PRELIMINARY_WITH_FINAL_ROUND_ROBIN');
    });
  });

  describe('register (custom plugin)', () => {
    it('can register a new plugin type', () => {
      const customPlugin = { type: 'CUSTOM_TYPE', isBasic: true } as any;
      tournamentPluginRegistry.register(customPlugin);
      expect(tournamentPluginRegistry.has('CUSTOM_TYPE')).toBe(true);
      expect(tournamentPluginRegistry.get('CUSTOM_TYPE')).toBe(customPlugin);
    });

    it('overwrites existing plugin when re-registering same type', () => {
      const plugin1 = { type: 'OVERWRITE_TEST', isBasic: true, version: 1 } as any;
      const plugin2 = { type: 'OVERWRITE_TEST', isBasic: true, version: 2 } as any;
      tournamentPluginRegistry.register(plugin1);
      tournamentPluginRegistry.register(plugin2);
      expect((tournamentPluginRegistry.get('OVERWRITE_TEST') as any).version).toBe(2);
    });
  });
});
