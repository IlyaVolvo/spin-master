import type { ScenarioDef } from '../lib/types';
import { showcaseScenarios } from './showcaseBatch';
import { playerScenarios } from './playerBatch';
import { organizerScenarios } from './organizerBatch';
import { adminScenarios } from './adminBatch';

/** Showcase first (primary), then role catalogs (secondary / collapsed in UI). */
export const ALL_SCENARIOS: ScenarioDef[] = [
  ...showcaseScenarios,
  ...playerScenarios,
  ...organizerScenarios,
  ...adminScenarios,
];

export function scenarioCountByRole(): Record<string, number> {
  const out: Record<string, number> = { showcase: 0, player: 0, organizer: 0, admin: 0 };
  for (const s of ALL_SCENARIOS) {
    if (s.showcase) out.showcase += 1;
    out[s.role] = (out[s.role] || 0) + 1;
  }
  return out;
}
