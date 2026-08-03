/**
 * One-command showcase recapture (layout refresh without changing step scripts):
 *   1) reset + seed tutorial DB
 *   2) start ephemeral API + Vite on dedicated ports
 *   3) capture all showcase scenarios
 *   4) write catalog + stop servers
 *
 *   cd server && npm run tutorials:recapture-showcases
 *
 * Env (optional):
 *   TUTORIAL_CAPTURE_CLIENT_PORT  default 3010
 *   TUTORIAL_CAPTURE_API_PORT     default 3011
 *   TUTORIAL_CAPTURE_ONLY         comma-separated slugs (overrides showcases-only)
 *   TUTORIAL_RECAPTURE_SKIP_RESET=1  skip reset-seed (reuse current tutorial DB)
 */
import { ChildProcess, spawn, execSync } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import dotenv from 'dotenv';
import { assertTutorialDatabaseUrl, redactDatabaseUrl } from './lib/safety';

const serverRoot = path.resolve(__dirname, '../..');
const clientRoot = path.resolve(serverRoot, '../client');
dotenv.config({ path: path.join(serverRoot, '.env') });

const CLIENT_PORT = Number(process.env.TUTORIAL_CAPTURE_CLIENT_PORT || 3010) || 3010;
const API_PORT = Number(process.env.TUTORIAL_CAPTURE_API_PORT || 3011) || 3011;
const BASE_URL = `http://localhost:${CLIENT_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

const children: ChildProcess[] = [];
let cleaning = false;

function log(msg: string): void {
  console.log(`[tutorials:recapture-showcases] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopChildren(): void {
  if (cleaning) return;
  cleaning = true;
  for (const child of children.splice(0)) {
    if (!child.pid || child.exitCode != null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
}

function spawnTracked(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: true,
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!cleaning && code && code !== 0) {
      console.error(`[tutorials:recapture-showcases] ${label} exited (${signal || code})`);
    }
  });
  return child;
}

function httpOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(!!res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url: string, label: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await httpOk(url)) {
      log(`${label} ready (${url})`);
      return;
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function main(): Promise<void> {
  const tutorialUrl = assertTutorialDatabaseUrl(process.env.DATABASE_URL_TUTORIAL);
  log(`Tutorial DB: ${redactDatabaseUrl(tutorialUrl)}`);
  log(`Client ${BASE_URL} · API ${API_URL}`);

  process.on('SIGINT', () => {
    stopChildren();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    stopChildren();
    process.exit(143);
  });

  try {
    if (process.env.TUTORIAL_RECAPTURE_SKIP_RESET === '1') {
      log('Skipping reset-seed (TUTORIAL_RECAPTURE_SKIP_RESET=1)');
    } else {
      log('Step 1/4: reset + seed');
      execSync('npm run tutorials:reset-seed', {
        cwd: serverRoot,
        stdio: 'inherit',
        env: process.env,
      });
    }

    log('Step 2/4: start API + Vite');
    spawnTracked(
      'npx',
      ['tsx', 'src/index.ts'],
      serverRoot,
      {
        ...process.env,
        DATABASE_URL: tutorialUrl,
        DATABASE_URL_TUTORIAL: tutorialUrl,
        PORT: String(API_PORT),
        CLIENT_URL: BASE_URL,
        JWT_SECRET: process.env.JWT_SECRET || 'tutorial-capture-secret',
      },
      'API',
    );
    spawnTracked(
      'npx',
      ['vite', '--port', String(CLIENT_PORT), '--strictPort'],
      clientRoot,
      {
        ...process.env,
        VITE_DEV_SERVER_PORT: String(CLIENT_PORT),
        VITE_DEV_API_ORIGIN: API_URL,
      },
      'Vite',
    );

    await waitFor(API_URL, 'API');
    await waitFor(BASE_URL, 'Vite');

    log('Step 3/4: capture showcases');
    const captureEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL_TUTORIAL: tutorialUrl,
      ROLE_TUTORIAL_BASE_URL: BASE_URL,
      TUTORIAL_CAPTURE_SHOWCASES: '1',
    };
    // Explicit TUTORIAL_CAPTURE_ONLY still wins inside captureTutorials.ts
    execSync('npm run tutorials:capture', {
      cwd: serverRoot,
      stdio: 'inherit',
      env: captureEnv,
    });

    log('Step 4/4: write catalog');
    execSync('npm run tutorials:write-catalog', {
      cwd: serverRoot,
      stdio: 'inherit',
      env: process.env,
    });

    log('Done.');
  } finally {
    log('Stopping capture servers…');
    stopChildren();
    await sleep(500);
  }
}

main().catch((err) => {
  console.error(err);
  stopChildren();
  process.exit(1);
});
