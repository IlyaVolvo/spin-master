jest.mock('../../src/index', () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../src/services/socketService', () => ({
  emitSystemConfigUpdated: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { prisma } from '../../src/index';
import { emitSystemConfigUpdated } from '../../src/services/socketService';
import {
  calculateSwissDefaultRounds,
  getSystemConfig,
  initializeSystemConfig,
  updateSystemConfig,
  validateSystemConfig,
} from '../../src/services/systemConfigService';

describe('systemConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.systemConfig.upsert as jest.Mock).mockResolvedValue({});
  });

  it('validates and merges missing config keys with defaults', () => {
    const config = validateSystemConfig({
      authPolicy: { minimumPasswordLength: 10 },
      branding: { clubName: ' Test Club ' },
    });

    expect(config.branding.clubName).toBe('Test Club');
    expect(config.authPolicy.minimumPasswordLength).toBe(10);
    expect(config.authPolicy.passwordResetTokenTtlHours).toBe(1);
    expect(config.tournamentRules.playoff.seedDivisor).toBe(4);
  });

  it('calculates Swiss default rounds from participant count with a minimum of three', () => {
    expect(calculateSwissDefaultRounds(6, 2)).toBe(3);
    expect(calculateSwissDefaultRounds(8, 2)).toBe(4);
    expect(calculateSwissDefaultRounds(24, 2)).toBe(6);
  });

  it('creates the singleton config on initialization', async () => {
    await initializeSystemConfig();

    expect(prisma.systemConfig.findUnique).toHaveBeenCalledWith({ where: { id: 'system' } });
    expect(prisma.systemConfig.upsert).toHaveBeenCalled();
    expect(getSystemConfig().authPolicy.minimumPasswordLength).toBe(6);
  });

  it('persists updates, refreshes memory, and broadcasts changes', async () => {
    await initializeSystemConfig();
    const updated = await updateSystemConfig({
      branding: { clubName: 'Runtime Club' },
      clientRuntime: { tournamentsListCacheTtlMs: 5000 },
    });

    expect(updated.branding.clubName).toBe('Runtime Club');
    expect(getSystemConfig().clientRuntime.tournamentsListCacheTtlMs).toBe(5000);
    expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(2);
    expect(emitSystemConfigUpdated).toHaveBeenCalledTimes(1);
  });
});
