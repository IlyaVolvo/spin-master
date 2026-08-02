import type { ScenarioDef } from '../lib/types';
import { showcaseScenarios } from './showcaseBatch';
import { playerScenarios } from './playerBatch';
import { organizerScenarios } from './organizerBatch';
import { adminScenarios } from './adminBatch';

/** Showcases first (public catalog), then short clips kept for capture only. */
export const ALL_SCENARIOS: ScenarioDef[] = [
  ...showcaseScenarios,
  ...playerScenarios,
  ...organizerScenarios,
  ...adminScenarios,
];

export function scenarioCountByRole(): Record<string, number> {
  const out: Record<string, number> = { player: 0, organizer: 0, admin: 0 };
  for (const s of ALL_SCENARIOS) {
    if (!s.showcase) continue;
    out[s.role] = (out[s.role] || 0) + 1;
  }
  return out;
}
