/**
 * Runs before any test file (Jest `setupFiles`), before `src/index` is imported.
 * Point Prisma at DATABASE_URL_TEST so local dev data is never touched by tests.
 */
import path from 'path';
import dotenv from 'dotenv';

const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const testDbUrl = process.env.DATABASE_URL_TEST?.trim();
const allowDevDb = process.env.ALLOW_JEST_ON_DEV_DATABASE === 'true';

if (testDbUrl) {
  process.env.DATABASE_URL = testDbUrl;
} else if (allowDevDb && process.env.DATABASE_URL?.trim()) {
  // Explicit opt-in: tests use DATABASE_URL from .env (unsafe for local dev data)
} else {
  throw new Error(
    '[Jest] Set DATABASE_URL_TEST in server/.env (or the environment) to a dedicated test database.\n' +
      'Example: DATABASE_URL_TEST="postgresql://user@localhost:5432/spin_master_test?schema=public"\n' +
      'Apply schema: npm run prisma:migrate:test --prefix server\n' +
      'To run tests against DATABASE_URL from .env (not recommended), set ALLOW_JEST_ON_DEV_DATABASE=true'
  );
}
