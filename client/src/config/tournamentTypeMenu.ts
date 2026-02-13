import { TournamentType } from '../types/tournament';

/**
 * Hierarchical menu configuration for tournament type selection.
 *
 * Each entry is either:
 *   - A leaf: { label, type } — directly selectable tournament type
 *   - A group: { label, children } — expands to show nested choices
 *
 * Plugins not listed here are appended at the end in arbitrary order.
 * This is the ONLY file that is aware of all plugin types.
 */

export interface TournamentMenuLeaf {
  label: string;
  type: TournamentType;
}

export interface TournamentMenuGroup {
  label: string;
  children: TournamentMenuItem[];
}

export type TournamentMenuItem = TournamentMenuLeaf | TournamentMenuGroup;

export function isMenuGroup(item: TournamentMenuItem): item is TournamentMenuGroup {
  return 'children' in item;
}

export const tournamentTypeMenu: TournamentMenuItem[] = [
  { label: 'Round Robin', type: 'ROUND_ROBIN' },
  { label: 'Playoff / Bracket', type: 'PLAYOFF' },
  { label: 'Multi Round Robin', type: 'MULTI_ROUND_ROBINS' },
  {
    label: 'Preliminary',
    children: [
      { label: 'Round Robin Final', type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN' },
      { label: 'Playoff Final', type: 'PRELIMINARY_WITH_FINAL_PLAYOFF' },
    ],
  },
  { label: 'Swiss', type: 'SWISS' },
];

/**
 * Collect all TournamentType values referenced in the menu tree.
 */
export function getMenuTypes(items: TournamentMenuItem[]): Set<TournamentType> {
  const types = new Set<TournamentType>();
  for (const item of items) {
    if (isMenuGroup(item)) {
      for (const t of getMenuTypes(item.children)) types.add(t);
    } else {
      types.add(item.type);
    }
  }
  return types;
}
