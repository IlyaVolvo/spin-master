/**
 * Runs `prisma migrate deploy` against DATABASE_URL_TEST (same DB Jest uses).
 */
import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

/** Suggest a test DB URL from dev DATABASE_URL (same host/user, db name + `_test`). */
function suggestTestDatabaseUrl(devUrl: string): string | null {
  try {
    const u = new URL(devUrl);
    const seg = u.pathname.replace(/^\//, '').split('/')[0];
    if (!seg) return null;
    const testDb = seg.endsWith('_test') ? seg : `${seg}_test`;
    u.pathname = `/${testDb}`;
    return u.toString();
  } catch {
    return null;
  }
}

const testDbUrl = process.env.DATABASE_URL_TEST?.trim();
if (!testDbUrl) {
  console.error('DATABASE_URL_TEST is not set in server/.env.');
  const dev = process.env.DATABASE_URL?.trim();
  const suggested = dev ? suggestTestDatabaseUrl(dev) : null;
  if (suggested) {
    console.error('\nAdd a line like (create the empty database first, e.g. `createdb mydb_test`):\n');
    console.error(`DATABASE_URL_TEST="${suggested}"\n`);
  } else {
    console.error('\nCopy DATABASE_URL_TEST from server/env.example and set a dedicated test database name.\n');
  }
  process.exit(1);
}

/** Log target without password (for debugging P1010 / auth issues). */
function logTarget(urlStr: string): void {
  try {
    const u = new URL(urlStr);
    const db = u.pathname.replace(/^\//, '').split('/')[0] || '(unknown)';
    const user = decodeURIComponent(u.username || '(no user)');
    console.error(`\n[prisma:migrate:test] Target: ${user}@${u.hostname}:${u.port || '5432'}/${db}`);
  } catch {
    // ignore
  }
}

logTarget(testDbUrl);

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });
} catch {
  console.error(`
If you see P1010 (access denied), common fixes:
  1) Same DB user as dev: DATABASE_URL_TEST must use the same username/password as DATABASE_URL (only the database name changes).
  2) IPv4 vs IPv6: try host 127.0.0.1 instead of localhost in DATABASE_URL_TEST (Prisma may use ::1; pg_hba may only allow 127.0.0.1).
  3) Verify Postgres accepts this URL:
       psql "<paste DATABASE_URL_TEST here>" -c "SELECT 1"
`);
  process.exit(1);
}
