import { prisma } from '../../src/index';
import { resetAppDatabase } from './helpers';

/** Reset DB before each test (multiple suites can run in one Jest process). */
export function useFunctionalDbLifecycle(): void {
  beforeEach(async () => {
    await resetAppDatabase(prisma);
  });
}
