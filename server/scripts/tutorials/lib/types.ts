import type { CaptureContext } from './browser';
import type { HotspotPct } from './hotspot';

export type ScenarioRole = 'player' | 'organizer' | 'admin';

/**
 * context = orient; action = click hotspot; result = outcome of prior action;
 * bridge = brief timed note (auto-advances; used after the first of several similar selections)
 */
export type StepKind = 'context' | 'action' | 'result' | 'bridge';

export type ScenarioStepDef = {
  id: string;
  title: string;
  body: string;
  kind?: StepKind;
  actionHint?: string;
  /** Shown on result steps as “What changed”. */
  resultNote?: string;
  /**
   * When set, the player auto-advances after this many ms (no click required).
   * Typical for `bridge` steps after the first of several similar selections.
   */
  autoAdvanceMs?: number;
  /** Prepare page state, optionally return hotspot for this step's screenshot. */
  capture: (ctx: CaptureContext) => Promise<{ hotspot?: HotspotPct } | void>;
};

export type ScenarioDef = {
  slug: string;
  role: ScenarioRole;
  title: string;
  description: string;
  relatedSlugs: string[];
  /** Featured evaluation examples — listed first in the catalog. */
  showcase?: boolean;
  /** When true, the complete screen omits “Next showcase”. */
  hideNextShowcase?: boolean;
  steps: ScenarioStepDef[];
};

export type PublishedStep = {
  id: string;
  title: string;
  body: string;
  image: string;
  kind?: StepKind;
  actionHint?: string;
  resultNote?: string;
  autoAdvanceMs?: number;
  hotspot?: HotspotPct;
};

export type PublishedScenario = {
  slug: string;
  role: ScenarioRole;
  title: string;
  description: string;
  relatedSlugs: string[];
  showcase?: boolean;
  hideNextShowcase?: boolean;
  viewport: { width: number; height: number };
  steps: PublishedStep[];
};
