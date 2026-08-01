import type { CaptureContext } from './browser';
import type { HotspotPct } from './hotspot';

export type ScenarioRole = 'player' | 'organizer' | 'admin';

/** context = orient; action = click hotspot; result = show outcome of prior action */
export type StepKind = 'context' | 'action' | 'result';

export type ScenarioStepDef = {
  id: string;
  title: string;
  body: string;
  kind?: StepKind;
  actionHint?: string;
  /** Shown on result steps as “What changed”. */
  resultNote?: string;
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
  hotspot?: HotspotPct;
};

export type PublishedScenario = {
  slug: string;
  role: ScenarioRole;
  title: string;
  description: string;
  relatedSlugs: string[];
  showcase?: boolean;
  viewport: { width: number; height: number };
  steps: PublishedStep[];
};
