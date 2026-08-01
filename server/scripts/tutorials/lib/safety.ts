/**
 * Ensure tutorial scripts only touch the dedicated tutorial database.
 */

const FORBIDDEN_DB_NAME_FRAGMENTS = [
  'prod',
  'production',
  'staging',
  'supabase',
  'pingpong_checkin', // common local app DB in this repo
];

const REQUIRED_NAME_FRAGMENT = 'tutorial';

export function assertTutorialDatabaseUrl(url: string | undefined | null, label = 'DATABASE_URL_TUTORIAL'): string {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    throw new Error(
      `${label} is not set. Add a dedicated Postgres database (e.g. spin_master_tutorials) to server/.env.`,
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Tutorial scripts refuse to run when NODE_ENV=production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  const dbName = (parsed.pathname.replace(/^\//, '').split('/')[0] || '').toLowerCase();
  if (!dbName) {
    throw new Error(`${label} must include a database name in the path.`);
  }

  if (!dbName.includes(REQUIRED_NAME_FRAGMENT)) {
    throw new Error(
      `${label} database name "${dbName}" must include "${REQUIRED_NAME_FRAGMENT}" (e.g. spin_master_tutorials).`,
    );
  }

  for (const frag of FORBIDDEN_DB_NAME_FRAGMENTS) {
    if (dbName.includes(frag) && !dbName.includes(REQUIRED_NAME_FRAGMENT)) {
      throw new Error(`${label} looks unsafe (matches "${frag}"). Refusing to continue.`);
    }
  }

  // Extra guard: never allow exact known app DB names even if somehow named oddly
  const blockedExact = new Set(['pingpong_checkin', 'spin-master', 'spinmaster', 'postgres']);
  if (blockedExact.has(dbName)) {
    throw new Error(`${label} points at blocked database "${dbName}".`);
  }

  return trimmed;
}

export function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const db = u.pathname.replace(/^\//, '').split('/')[0] || '(unknown)';
    const user = decodeURIComponent(u.username || '(no user)');
    return `${user}@${u.hostname}:${u.port || '5432'}/${db}`;
  } catch {
    return '(unparseable)';
  }
}
