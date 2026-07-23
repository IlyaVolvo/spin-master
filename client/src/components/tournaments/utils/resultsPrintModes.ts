import type { Tournament, TournamentType } from '../../../types/tournament';
import { tournamentPluginRegistry } from '../TournamentPluginRegistry';

export type ResultsPrintMode = 'standard' | 'detailed' | 'abbreviated';

const ALL_MODES: ResultsPrintMode[] = ['standard', 'detailed', 'abbreviated'];

function modesFromPluginFlags(plugin: {
  supportsDetailedResultsPrint?: boolean;
  supportsAbbreviatedResultsPrint?: boolean;
} | undefined): ResultsPrintMode[] {
  const modes: ResultsPrintMode[] = ['standard'];
  if (plugin?.supportsDetailedResultsPrint) modes.push('detailed');
  if (plugin?.supportsAbbreviatedResultsPrint) modes.push('abbreviated');
  return modes;
}

function pluginForTournamentType(type: string | undefined) {
  if (!type) return undefined;
  return tournamentPluginRegistry.get(type as TournamentType);
}

/** Modes a basic tournament type can print. */
export function getBasicSupportedResultsPrintModes(type: string | undefined): ResultsPrintMode[] {
  return modesFromPluginFlags(pluginForTournamentType(type));
}

/**
 * Modes offered in the UI for a tournament.
 * Basic: plugin flags. Compound: union of child basic plugins (Standard always).
 */
export function getSupportedResultsPrintModes(tournament: Tournament): ResultsPrintMode[] {
  const plugin = pluginForTournamentType(tournament.type);
  if (plugin && !plugin.isBasic) {
    const children = tournament.childTournaments || [];
    if (children.length === 0) {
      return ['standard'];
    }
    const supported = new Set<ResultsPrintMode>(['standard']);
    for (const child of children) {
      for (const mode of getBasicSupportedResultsPrintModes(child.type)) {
        supported.add(mode);
      }
    }
    return ALL_MODES.filter((mode) => supported.has(mode));
  }
  return getBasicSupportedResultsPrintModes(tournament.type);
}

/** If the child basic type does not support the requested mode, use Standard. */
export function resolveChildResultsPrintMode(
  child: Tournament,
  requested: ResultsPrintMode,
): ResultsPrintMode {
  if (requested === 'standard') return 'standard';
  const supported = getBasicSupportedResultsPrintModes(child.type);
  return supported.includes(requested) ? requested : 'standard';
}

export function isResultsPrintMode(value: string): value is ResultsPrintMode {
  return value === 'standard' || value === 'detailed' || value === 'abbreviated';
}
