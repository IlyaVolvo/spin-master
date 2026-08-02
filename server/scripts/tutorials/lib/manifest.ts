import * as fs from 'fs';
import * as path from 'path';
import { ASSETS_DIR, CATALOG_PATH, SCENARIOS_JSON_DIR, VIEWPORT } from './constants';
import type { PublishedScenario, ScenarioDef, StepKind } from './types';
import type { HotspotPct } from './hotspot';

const ROLE_ORDER = ['player', 'organizer', 'admin'] as const;

const ROLE_META: Record<(typeof ROLE_ORDER)[number], { label: string; blurb: string }> = {
  player: {
    label: 'Player',
    blurb: 'Member walkthroughs — plan, kiosk, rating history, and multi-player stats.',
  },
  organizer: {
    label: 'Organizer',
    blurb: 'Tournament walkthroughs — create events and correct completed scores.',
  },
  admin: {
    label: 'Administrator',
    blurb: 'Front desk, plans, system settings, kiosk, and tournament scores.',
  },
};

export function ensureTutorialDirs(slug: string): string {
  const assetDir = path.join(ASSETS_DIR, slug);
  fs.mkdirSync(SCENARIOS_JSON_DIR, { recursive: true });
  fs.mkdirSync(assetDir, { recursive: true });
  return assetDir;
}

export function stepImageRelPath(slug: string, stepIndex: number): string {
  const n = String(stepIndex + 1).padStart(2, '0');
  return `assets/${slug}/step-${n}.png`;
}

export function stepImageAbsPath(slug: string, stepIndex: number): string {
  const n = String(stepIndex + 1).padStart(2, '0');
  return path.join(ASSETS_DIR, slug, `step-${n}.png`);
}

export function writeScenarioJson(
  def: ScenarioDef,
  steps: Array<{
    id: string;
    title: string;
    body: string;
    kind?: StepKind;
    actionHint?: string;
    resultNote?: string;
    image: string;
    hotspot?: HotspotPct;
  }>,
): PublishedScenario {
  const published: PublishedScenario = {
    slug: def.slug,
    role: def.role,
    title: def.title,
    description: def.description,
    relatedSlugs: def.relatedSlugs,
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    steps: steps.map((s) => {
      const step: PublishedScenario['steps'][number] = {
        id: s.id,
        title: s.title,
        body: s.body,
        image: s.image,
      };
      if (s.kind) step.kind = s.kind;
      if (s.actionHint) step.actionHint = s.actionHint;
      if (s.resultNote) step.resultNote = s.resultNote;
      if (s.hotspot) step.hotspot = s.hotspot;
      return step;
    }),
  };
  if (def.showcase) published.showcase = true;

  fs.mkdirSync(SCENARIOS_JSON_DIR, { recursive: true });
  const out = path.join(SCENARIOS_JSON_DIR, `${def.slug}.json`);
  fs.writeFileSync(out, JSON.stringify(published, null, 2) + '\n', 'utf8');
  return published;
}

export function writeCatalog(scenarios: ScenarioDef[]): void {
  // Public catalog lists showcases only, grouped by role. Short isolation clips stay in
  // capture modules for maintainers but are not linked from the index.
  const byRole = new Map<string, ScenarioDef[]>();
  for (const id of ROLE_ORDER) byRole.set(id, []);
  for (const s of scenarios) {
    if (!s.showcase) continue;
    const list = byRole.get(s.role) || [];
    list.push(s);
    byRole.set(s.role, list);
  }

  const catalog = {
    roles: ROLE_ORDER.map((id) => ({
      id,
      label: ROLE_META[id].label,
      blurb: ROLE_META[id].blurb,
      collapsed: false,
      scenarios: (byRole.get(id) || []).map((s) => ({
        slug: s.slug,
        title: s.title,
      })),
    })),
  };

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
}
