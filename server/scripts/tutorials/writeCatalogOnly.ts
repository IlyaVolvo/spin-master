/** Write catalog.json from scenario modules. Optionally bootstrap missing scenario JSON (never overwrite). */
import * as fs from 'fs';
import * as path from 'path';
import { writeCatalog, writeScenarioJson, stepImageRelPath, ensureTutorialDirs } from './lib/manifest';
import { SCENARIOS_JSON_DIR } from './lib/constants';
import { ALL_SCENARIOS } from './scenarios';

for (const def of ALL_SCENARIOS) {
  ensureTutorialDirs(def.slug);
  const jsonPath = path.join(SCENARIOS_JSON_DIR, `${def.slug}.json`);
  if (fs.existsSync(jsonPath)) {
    continue;
  }
  writeScenarioJson(
    def,
    def.steps.map((s, i) => ({
      id: s.id,
      title: s.title,
      body: s.body,
      kind: s.kind,
      actionHint: s.actionHint,
      resultNote: s.resultNote,
      image: stepImageRelPath(def.slug, i),
    })),
  );
  console.log('Wrote stub', def.slug);
}

writeCatalog(ALL_SCENARIOS);
console.log('Wrote catalog.json');
