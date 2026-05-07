import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { emitSystemConfigUpdated } from './socketService';
import { logger } from '../utils/logger';
import { setRatingValidationBounds } from '../utils/memberValidation';

export type BrandingConfig = {
  clubName: string | null;
};

export type AuthPolicyConfig = {
  minimumPasswordLength: number;
  passwordResetTokenTtlHours: number;
};

export type PreregistrationConfig = {
  defaultTournamentOffsetDays: number;
  defaultTournamentTime: string;
  registrationDeadlineOffsetMinutes: number;
  cancelReasonPresets: string[];
};

export type RatingValidationConfig = {
  ratingInputMin: number;
  ratingInputMax: number;
  suspiciousRatingMin: number;
  suspiciousRatingMax: number;
};

export type TournamentRulesConfig = {
  roundRobin: {
    minPlayers: number;
    maxPlayers: number;
  };
  playoff: {
    minPlayers: number;
    seedDivisor: number;
  };
  swiss: {
    minPlayers: number;
    pairByRating: boolean;
    maxRoundsDivisor: number;
  };
  multiRoundRobins: {
    minPlayers: number;
    minGroupSize: number;
    minGroups: number;
  };
  preliminary: {
    groupSizeMin: number;
    groupSizeMax: number;
    groupSizeDefault: number;
    finalRoundRobinSizeDefault: number;
    reservedFinalSpotsForAutoQualified: number;
  };
  matchScore: {
    min: number;
    max: number;
    allowEqualScores: boolean;
  };
};

export type ClientRuntimeConfig = {
  tournamentsListCacheTtlMs: number;
  socketReconnectionDelayMs: number;
  socketReconnectionAttempts: number;
};

export type SystemConfig = {
  branding: BrandingConfig;
  authPolicy: AuthPolicyConfig;
  preregistration: PreregistrationConfig;
  ratingValidation: RatingValidationConfig;
  tournamentRules: TournamentRulesConfig;
  clientRuntime: ClientRuntimeConfig;
};

export type SystemConfigPatch = Partial<{
  [K in keyof SystemConfig]: Partial<SystemConfig[K]>;
}>;

const SYSTEM_CONFIG_ID = 'system';

const DEFAULT_CANCEL_REASONS = [
  'Tournament cancelled by organizer',
  'Not enough registered players',
  'Schedule conflict',
  'Venue unavailable',
  'Weather or emergency closure',
];

function getEnvClubName(): string | null {
  const raw = process.env.CLUB_NAME;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export function getDefaultSystemConfig(): SystemConfig {
  return {
    branding: {
      clubName: getEnvClubName(),
    },
    authPolicy: {
      minimumPasswordLength: 6,
      passwordResetTokenTtlHours: 1,
    },
    preregistration: {
      defaultTournamentOffsetDays: 1,
      defaultTournamentTime: '18:00',
      registrationDeadlineOffsetMinutes: 30,
      cancelReasonPresets: DEFAULT_CANCEL_REASONS,
    },
    ratingValidation: {
      ratingInputMin: 0,
      ratingInputMax: 9999,
      suspiciousRatingMin: 800,
      suspiciousRatingMax: 2100,
    },
    tournamentRules: {
      roundRobin: {
        minPlayers: 3,
        maxPlayers: 32,
      },
      playoff: {
        minPlayers: 2,
        seedDivisor: 4,
      },
      swiss: {
        minPlayers: 6,
        pairByRating: true,
        maxRoundsDivisor: 2,
      },
      multiRoundRobins: {
        minPlayers: 6,
        minGroupSize: 3,
        minGroups: 2,
      },
      preliminary: {
        groupSizeMin: 3,
        groupSizeMax: 12,
        groupSizeDefault: 4,
        finalRoundRobinSizeDefault: 6,
        reservedFinalSpotsForAutoQualified: 6,
      },
      matchScore: {
        min: 0,
        max: 10,
        allowEqualScores: false,
      },
    },
    clientRuntime: {
      tournamentsListCacheTtlMs: 30000,
      socketReconnectionDelayMs: 1000,
      socketReconnectionAttempts: 5,
    },
  };
}

let cachedConfig: SystemConfig = getDefaultSystemConfig();
let initialized = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return base;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] = isRecord(existing) && isRecord(value) ? deepMerge(existing, value) : value;
  }
  return result as T;
}

function requireInteger(value: unknown, path: string, min?: number, max?: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${path} must be an integer`);
  }
  const num = value as number;
  if (min !== undefined && num < min) throw new Error(`${path} must be at least ${min}`);
  if (max !== undefined && num > max) throw new Error(`${path} must be at most ${max}`);
  return num;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be true or false`);
  return value;
}

function requireTime(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${path} must use HH:mm format`);
  }
  const [hour, minute] = value.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`${path} must be a valid time`);
  }
  return value;
}

function validateBranding(value: unknown): BrandingConfig {
  const config = deepMerge(getDefaultSystemConfig().branding, value);
  if (config.clubName !== null && typeof config.clubName !== 'string') {
    throw new Error('branding.clubName must be a string or null');
  }
  return {
    clubName: typeof config.clubName === 'string' && config.clubName.trim() !== ''
      ? config.clubName.trim()
      : null,
  };
}

function validateAuthPolicy(value: unknown): AuthPolicyConfig {
  const config = deepMerge(getDefaultSystemConfig().authPolicy, value);
  return {
    minimumPasswordLength: requireInteger(config.minimumPasswordLength, 'authPolicy.minimumPasswordLength', 6, 128),
    passwordResetTokenTtlHours: requireInteger(config.passwordResetTokenTtlHours, 'authPolicy.passwordResetTokenTtlHours', 1, 168),
  };
}

function validatePreregistration(value: unknown): PreregistrationConfig {
  const config = deepMerge(getDefaultSystemConfig().preregistration, value);
  if (!Array.isArray(config.cancelReasonPresets) || config.cancelReasonPresets.length === 0) {
    throw new Error('preregistration.cancelReasonPresets must include at least one reason');
  }
  const cancelReasonPresets = config.cancelReasonPresets.map((reason, index) => {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`preregistration.cancelReasonPresets[${index}] must be a non-empty string`);
    }
    return reason.trim();
  });
  return {
    defaultTournamentOffsetDays: requireInteger(config.defaultTournamentOffsetDays, 'preregistration.defaultTournamentOffsetDays', 0, 365),
    defaultTournamentTime: requireTime(config.defaultTournamentTime, 'preregistration.defaultTournamentTime'),
    registrationDeadlineOffsetMinutes: requireInteger(config.registrationDeadlineOffsetMinutes, 'preregistration.registrationDeadlineOffsetMinutes', 0, 525600),
    cancelReasonPresets,
  };
}

function validateRatingValidation(value: unknown): RatingValidationConfig {
  const config = deepMerge(getDefaultSystemConfig().ratingValidation, value);
  const ratingInputMin = requireInteger(config.ratingInputMin, 'ratingValidation.ratingInputMin', 0);
  const ratingInputMax = requireInteger(config.ratingInputMax, 'ratingValidation.ratingInputMax', ratingInputMin);
  const suspiciousRatingMin = requireInteger(config.suspiciousRatingMin, 'ratingValidation.suspiciousRatingMin', ratingInputMin, ratingInputMax);
  const suspiciousRatingMax = requireInteger(config.suspiciousRatingMax, 'ratingValidation.suspiciousRatingMax', suspiciousRatingMin, ratingInputMax);
  return { ratingInputMin, ratingInputMax, suspiciousRatingMin, suspiciousRatingMax };
}

export function calculateSwissDefaultRounds(participantCount: number, maxRoundsDivisor = 2): number {
  const safeParticipantCount = Math.max(participantCount, 2);
  const safeMaxRoundsDivisor = Math.max(maxRoundsDivisor, 1);
  const maxRounds = Math.floor(safeParticipantCount / safeMaxRoundsDivisor);
  const suggestedRounds = Math.ceil(Math.log2(safeParticipantCount)) + 1;
  return Math.max(3, Math.min(suggestedRounds, Math.max(3, maxRounds)));
}

function validateTournamentRules(value: unknown): TournamentRulesConfig {
  const config = deepMerge(getDefaultSystemConfig().tournamentRules, value);

  const roundRobinMin = requireInteger(config.roundRobin.minPlayers, 'tournamentRules.roundRobin.minPlayers', 2);
  const roundRobinMax = requireInteger(config.roundRobin.maxPlayers, 'tournamentRules.roundRobin.maxPlayers', roundRobinMin);

  const playoffMin = requireInteger(config.playoff.minPlayers, 'tournamentRules.playoff.minPlayers', 2);
  const seedDivisor = requireInteger(config.playoff.seedDivisor, 'tournamentRules.playoff.seedDivisor', 1);

  const groupSizeMin = requireInteger(config.preliminary.groupSizeMin, 'tournamentRules.preliminary.groupSizeMin', 2);
  const groupSizeMax = requireInteger(config.preliminary.groupSizeMax, 'tournamentRules.preliminary.groupSizeMax', groupSizeMin);
  const groupSizeDefault = requireInteger(config.preliminary.groupSizeDefault, 'tournamentRules.preliminary.groupSizeDefault', groupSizeMin, groupSizeMax);

  const scoreMin = requireInteger(config.matchScore.min, 'tournamentRules.matchScore.min', 0);
  const scoreMax = requireInteger(config.matchScore.max, 'tournamentRules.matchScore.max', scoreMin);

  return {
    roundRobin: {
      minPlayers: roundRobinMin,
      maxPlayers: roundRobinMax,
    },
    playoff: {
      minPlayers: playoffMin,
      seedDivisor,
    },
    swiss: {
      minPlayers: requireInteger(config.swiss.minPlayers, 'tournamentRules.swiss.minPlayers', 2),
      pairByRating: requireBoolean(config.swiss.pairByRating, 'tournamentRules.swiss.pairByRating'),
      maxRoundsDivisor: requireInteger(config.swiss.maxRoundsDivisor, 'tournamentRules.swiss.maxRoundsDivisor', 1),
    },
    multiRoundRobins: {
      minPlayers: requireInteger(config.multiRoundRobins.minPlayers, 'tournamentRules.multiRoundRobins.minPlayers', 2),
      minGroupSize: requireInteger(config.multiRoundRobins.minGroupSize, 'tournamentRules.multiRoundRobins.minGroupSize', 2),
      minGroups: requireInteger(config.multiRoundRobins.minGroups, 'tournamentRules.multiRoundRobins.minGroups', 2),
    },
    preliminary: {
      groupSizeMin,
      groupSizeMax,
      groupSizeDefault,
      finalRoundRobinSizeDefault: requireInteger(config.preliminary.finalRoundRobinSizeDefault, 'tournamentRules.preliminary.finalRoundRobinSizeDefault', 2),
      reservedFinalSpotsForAutoQualified: requireInteger(config.preliminary.reservedFinalSpotsForAutoQualified, 'tournamentRules.preliminary.reservedFinalSpotsForAutoQualified', 0),
    },
    matchScore: {
      min: scoreMin,
      max: scoreMax,
      allowEqualScores: requireBoolean(config.matchScore.allowEqualScores, 'tournamentRules.matchScore.allowEqualScores'),
    },
  };
}

function validateClientRuntime(value: unknown): ClientRuntimeConfig {
  const config = deepMerge(getDefaultSystemConfig().clientRuntime, value);
  return {
    tournamentsListCacheTtlMs: requireInteger(config.tournamentsListCacheTtlMs, 'clientRuntime.tournamentsListCacheTtlMs', 0),
    socketReconnectionDelayMs: requireInteger(config.socketReconnectionDelayMs, 'clientRuntime.socketReconnectionDelayMs', 0),
    socketReconnectionAttempts: requireInteger(config.socketReconnectionAttempts, 'clientRuntime.socketReconnectionAttempts', 0),
  };
}

export function validateSystemConfig(input: unknown): SystemConfig {
  const merged = deepMerge(getDefaultSystemConfig(), input);
  return {
    branding: validateBranding(merged.branding),
    authPolicy: validateAuthPolicy(merged.authPolicy),
    preregistration: validatePreregistration(merged.preregistration),
    ratingValidation: validateRatingValidation(merged.ratingValidation),
    tournamentRules: validateTournamentRules(merged.tournamentRules),
    clientRuntime: validateClientRuntime(merged.clientRuntime),
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function persistConfig(config: SystemConfig): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    create: {
      id: SYSTEM_CONFIG_ID,
      branding: toPrismaJson(config.branding),
      authPolicy: toPrismaJson(config.authPolicy),
      preregistration: toPrismaJson(config.preregistration),
      ratingValidation: toPrismaJson(config.ratingValidation),
      tournamentRules: toPrismaJson(config.tournamentRules),
      clientRuntime: toPrismaJson(config.clientRuntime),
    },
    update: {
      branding: toPrismaJson(config.branding),
      authPolicy: toPrismaJson(config.authPolicy),
      preregistration: toPrismaJson(config.preregistration),
      ratingValidation: toPrismaJson(config.ratingValidation),
      tournamentRules: toPrismaJson(config.tournamentRules),
      clientRuntime: toPrismaJson(config.clientRuntime),
    },
  });
}

export async function initializeSystemConfig(): Promise<SystemConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { id: SYSTEM_CONFIG_ID } });
  const fromDb = row
    ? {
        branding: row.branding,
        authPolicy: row.authPolicy,
        preregistration: row.preregistration,
        ratingValidation: row.ratingValidation,
        tournamentRules: row.tournamentRules,
        clientRuntime: row.clientRuntime,
      }
    : undefined;

  const nextConfig = validateSystemConfig(fromDb);
  cachedConfig = nextConfig;
  setRatingValidationBounds(nextConfig.ratingValidation);
  initialized = true;
  await persistConfig(nextConfig);

  logger.info('System configuration initialized');
  return cachedConfig;
}

export function getSystemConfig(): SystemConfig {
  return cachedConfig;
}

export function getPublicSystemConfig(): SystemConfig {
  return getSystemConfig();
}

export async function updateSystemConfig(patch: SystemConfigPatch): Promise<SystemConfig> {
  if (!initialized) {
    await initializeSystemConfig();
  }

  const nextConfig = validateSystemConfig(deepMerge(cachedConfig, patch));
  await persistConfig(nextConfig);
  cachedConfig = nextConfig;
  setRatingValidationBounds(nextConfig.ratingValidation);
  emitSystemConfigUpdated();
  return cachedConfig;
}

export function getAuthPolicyConfig(): AuthPolicyConfig {
  return getSystemConfig().authPolicy;
}

export function getPreregistrationConfig(): PreregistrationConfig {
  return getSystemConfig().preregistration;
}

export function getRatingValidationConfig(): RatingValidationConfig {
  return getSystemConfig().ratingValidation;
}

export function getTournamentRulesConfig(): TournamentRulesConfig {
  return getSystemConfig().tournamentRules;
}

export function getClientRuntimeConfig(): ClientRuntimeConfig {
  return getSystemConfig().clientRuntime;
}
