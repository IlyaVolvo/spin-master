import { spawnSync } from 'node:child_process';

const resolvedChangeset = (
  process.env.COMMIT_SHA ||
  process.env.VITE_CHANGESET_ID ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SOURCE_VERSION ||
  'devbuild'
).slice(0, 7);

const env = {
  ...process.env,
  VITE_CHANGESET_ID: resolvedChangeset,
};

const result = spawnSync('vite', ['build'], {
  stdio: 'inherit',
  shell: true,
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
