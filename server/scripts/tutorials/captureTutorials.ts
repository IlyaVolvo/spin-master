/**
 * Capture all interactive tutorial scenarios from the running app.
 *
 * Prerequisites:
 *   1. Tutorial DB reset+seeded (npm run tutorials:reset-seed)
 *   2. API + client running against that tutorial DB
 *   3. ROLE_TUTORIAL_BASE_URL (default http://localhost:3000)
 *
 * Continues after individual scenario failures; exits 1 if any failed.
 */
import dotenv from 'dotenv';
import path from 'path';
import { launchTutorialBrowser, makeCaptureContext, logout } from './lib/browser';
import { BASE_URL } from './lib/constants';
import {
  ensureTutorialDirs,
  stepImageAbsPath,
  stepImageRelPath,
  writeCatalog,
  writeScenarioJson,
} from './lib/manifest';
import { assertTutorialDatabaseUrl, redactDatabaseUrl } from './lib/safety';
import { ALL_SCENARIOS } from './scenarios';
import type { HotspotPct } from './lib/hotspot';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function captureOne(
  scenarioSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = ALL_SCENARIOS.find((s) => s.slug === scenarioSlug);
  if (!def) return { ok: false, error: `Unknown scenario ${scenarioSlug}` };

  ensureTutorialDirs(def.slug);
  const browser = await launchTutorialBrowser();
  try {
    const page = await browser.newPage();
    const publishedSteps: Array<{
      id: string;
      title: string;
      body: string;
      kind?: import('./lib/types').StepKind;
      actionHint?: string;
      resultNote?: string;
      image: string;
      hotspot?: HotspotPct;
    }> = [];

    for (let i = 0; i < def.steps.length; i++) {
      const stepDef = def.steps[i];
      const abs = stepImageAbsPath(def.slug, i);
      const rel = stepImageRelPath(def.slug, i);
      const ctx = makeCaptureContext(page, abs);
      const result = (await stepDef.capture(ctx)) || {};
      await page.screenshot({ path: abs, type: 'png' });
      publishedSteps.push({
        id: stepDef.id,
        title: stepDef.title,
        body: stepDef.body,
        kind: stepDef.kind,
        actionHint: stepDef.actionHint,
        resultNote: stepDef.resultNote,
        image: rel,
        hotspot: result.hotspot,
      });
      console.log(`    step ${i + 1}/${def.steps.length}: ${stepDef.id}`);
    }

    writeScenarioJson(def, publishedSteps);
    try {
      await logout(page);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    await browser.close();
  }
}

async function main() {
  // Capture does not mutate DB, but require tutorial URL to be configured as a guardrail
  // that maintainers are on the documented workflow. Override with TUTORIAL_CAPTURE_SKIP_DB_CHECK=1.
  if (process.env.TUTORIAL_CAPTURE_SKIP_DB_CHECK !== '1') {
    const url = assertTutorialDatabaseUrl(process.env.DATABASE_URL_TUTORIAL);
    console.log('[tutorials:capture] DATABASE_URL_TUTORIAL:', redactDatabaseUrl(url));
    console.log(
      '[tutorials:capture] Ensure the running API uses this same database. Base URL:',
      BASE_URL,
    );
  }

  writeCatalog(ALL_SCENARIOS);

  const only = (process.env.TUTORIAL_CAPTURE_ONLY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const queue = only.length
    ? ALL_SCENARIOS.filter((s) => only.includes(s.slug))
    : ALL_SCENARIOS;
  if (only.length && queue.length !== only.length) {
    const missing = only.filter((s) => !queue.some((q) => q.slug === s));
    console.warn('[tutorials:capture] Unknown slugs in TUTORIAL_CAPTURE_ONLY:', missing.join(', '));
  }

  const results: Array<{ slug: string; ok: boolean; error?: string }> = [];

  for (const def of queue) {
    console.log(`\n[tutorials:capture] Scenario: ${def.slug}`);
    const result = await captureOne(def.slug);
    if (result.ok) {
      console.log(`  OK ${def.slug}`);
      results.push({ slug: def.slug, ok: true });
    } else {
      console.error(`  FAIL ${def.slug}: ${result.error}`);
      results.push({ slug: def.slug, ok: false, error: result.error });
    }
  }

  console.log('\n========== Capture report ==========');
  for (const r of results) {
    console.log(r.ok ? `  ✓ ${r.slug}` : `  ✗ ${r.slug} — ${r.error}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`Done. ${results.length - failed.length}/${results.length} succeeded.`);

  // Always refresh catalog even if some failed
  writeCatalog(ALL_SCENARIOS);

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
