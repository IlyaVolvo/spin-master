import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  /** Functional suites override with jest.setTimeout; keep default high enough for slow DB I/O. */
  testTimeout: 120000,
  globalTeardown: '<rootDir>/tests/jestGlobalTeardown.ts',
  // Use test-specific tsconfig (no rootDir constraint, includes Jest types)
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // Module name mapping so tests can import from src/
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Verbose output for clear test reporting
  verbose: true,
};

export default config;
