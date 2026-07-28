import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { emitSystemConfigUpdated } from './socketService';
import { logger } from '../utils/logger';
import { setRatingValidationBounds } from '../utils/memberValidation';
import {
  ACHIEVEMENT_CATEGORY_IDS,
  type AchievementCategoryId,
} from '../achievements/categoryIds';

export type BrandingConfig = {
  clubName: string | null;
};

export type AuthPolicyConfig = {
  minimumPasswordLength: number;
  passwordResetTokenTtlHours: number;
  /** Length of permanent digit-only score PINs (4–12). */
  pinLength: number;
  /**
   * Club default: elevated accounts (Organizer/Admin) enter kiosk mode on login.
   * Per-member override may force on/off.
   */
  autoRelinquishPrivileges: boolean;
  /**
   * After a password restore, re-enter kiosk after this many idle minutes.
   * 0 disables idle re-relinquish (login-only auto mode).
   */
  autoRelinquishIdleMinutes: number;
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

export type PreliminaryGroupRulesConfig = {
  groupSizeMin: number;
  groupSizeMax: number;
  groupSizeDefault: number;
  reservedFinalSpotsForAutoQualified: number;
};

export type PreliminaryWithFinalPlayoffRulesConfig = PreliminaryGroupRulesConfig & {
  /** How many finishers from each preliminary group qualify for the playoff. */
  qualifiersPerGroup: number;
};

export type PreliminaryWithFinalRoundRobinRulesConfig = PreliminaryGroupRulesConfig & {
  finalRoundRobinSizeDefault: number;
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
    maxGroupSize: number;
    minGroups: number;
  };
  /** Settings for PRELIMINARY_WITH_FINAL_ROUND_ROBIN */
  preliminaryWithFinalRoundRobin: PreliminaryWithFinalRoundRobinRulesConfig;
  /** Settings for PRELIMINARY_WITH_FINAL_PLAYOFF */
  preliminaryWithFinalPlayoff: PreliminaryWithFinalPlayoffRulesConfig;
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

export type VisitPricingFormulaParams = {
  basePricePerVisitCents: number;
  exponent: number;
};

export type ClubPlansConfig = {
  /** Admin-defined member segments; "Regular" is always required. */
  segments: string[];
  /** Optional legacy visit-pack pricing hints (not used by plan CRUD UI). */
  visitPricingFormula: Record<string, VisitPricingFormulaParams>;
};

export type PaymentsReminderConfig = {
  checkInBannerEnabled: boolean;
  emailEnabled: boolean;
  periodDaysBeforeExpiry: number;
  visitPackVisitsRemaining: number;
};

export type PaymentsConfig = {
  /** Active provider plugin id; empty = auto when exactly one usable offered provider. */
  providerId: string;
  adminNotifyEmails: string[];
  notifyAdminsOnCourtesy: boolean;
  courtesyGraceDays: number;
  courtesyExtraVisits: number;
  reminders: PaymentsReminderConfig;
};

export type AchievementsPublicAccessConfig = Record<AchievementCategoryId, number>;

export type PublicAccessConfig = {
  achievements: AchievementsPublicAccessConfig;
};

export type SystemConfig = {
  branding: BrandingConfig;
  authPolicy: AuthPolicyConfig;
  preregistration: PreregistrationConfig;
  ratingValidation: RatingValidationConfig;
  tournamentRules: TournamentRulesConfig;
  clientRuntime: ClientRuntimeConfig;
  clubPlans: ClubPlansConfig;
  publicAccess: PublicAccessConfig;
  payments: PaymentsConfig;
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
      pinLength: 4,
      autoRelinquishPrivileges: false,
      autoRelinquishIdleMinutes: 5,
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
        maxGroupSize: 12,
        minGroups: 2,
      },
      preliminaryWithFinalRoundRobin: {
        groupSizeMin: 3,
        groupSizeMax: 12,
        groupSizeDefault: 4,
        finalRoundRobinSizeDefault: 6,
        reservedFinalSpotsForAutoQualified: 6,
      },
      preliminaryWithFinalPlayoff: {
        groupSizeMin: 3,
        groupSizeMax: 12,
        groupSizeDefault: 4,
        reservedFinalSpotsForAutoQualified: 6,
        qualifiersPerGroup: 1,
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
    clubPlans: {
      segments: ['Regular'],
      visitPricingFormula: {
        Regular: { basePricePerVisitCents: 1000, exponent: 0.08 },
      },
    },
    publicAccess: {
      achievements: Object.fromEntries(
        ACHIEVEMENT_CATEGORY_IDS.map((id) => [id, 0]),
      ) as AchievementsPublicAccessConfig,
    },
    payments: {
      providerId: '',
      adminNotifyEmails: [],
      notifyAdminsOnCourtesy: true,
      courtesyGraceDays: 7,
      courtesyExtraVisits: 3,
      reminders: {
        checkInBannerEnabled: true,
        emailEnabled: true,
        periodDaysBeforeExpiry: 14,
        visitPackVisitsRemaining: 2,
      },
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
    pinLength: requireInteger(config.pinLength, 'authPolicy.pinLength', 4, 12),
    autoRelinquishPrivileges: Boolean(config.autoRelinquishPrivileges),
    autoRelinquishIdleMinutes: requireInteger(
      config.autoRelinquishIdleMinutes,
      'authPolicy.autoRelinquishIdleMinutes',
      0,
      120
    ),
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

function validatePreliminaryGroupRules(
  value: unknown,
  path: string,
): PreliminaryGroupRulesConfig {
  const defaults = getDefaultSystemConfig().tournamentRules.preliminaryWithFinalPlayoff;
  const config = deepMerge(defaults, value);
  const groupSizeMin = requireInteger(config.groupSizeMin, `${path}.groupSizeMin`, 2);
  const groupSizeMax = requireInteger(config.groupSizeMax, `${path}.groupSizeMax`, groupSizeMin);
  const groupSizeDefault = requireInteger(config.groupSizeDefault, `${path}.groupSizeDefault`, groupSizeMin, groupSizeMax);
  return {
    groupSizeMin,
    groupSizeMax,
    groupSizeDefault,
    reservedFinalSpotsForAutoQualified: requireInteger(
      config.reservedFinalSpotsForAutoQualified,
      `${path}.reservedFinalSpotsForAutoQualified`,
      0,
    ),
  };
}

function migrateTournamentRulesInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const raw = { ...value };
  // Legacy single `preliminary` block → per-final-type settings
  if (isRecord(raw.preliminary)) {
    const legacy = raw.preliminary;
    if (!isRecord(raw.preliminaryWithFinalRoundRobin)) {
      raw.preliminaryWithFinalRoundRobin = { ...legacy };
    }
    if (!isRecord(raw.preliminaryWithFinalPlayoff)) {
      raw.preliminaryWithFinalPlayoff = {
        groupSizeMin: legacy.groupSizeMin,
        groupSizeMax: legacy.groupSizeMax,
        groupSizeDefault: legacy.groupSizeDefault,
        reservedFinalSpotsForAutoQualified: legacy.reservedFinalSpotsForAutoQualified,
      };
    }
  }
  delete raw.preliminary;
  return raw;
}

function validateTournamentRules(value: unknown): TournamentRulesConfig {
  const config = deepMerge(
    getDefaultSystemConfig().tournamentRules,
    migrateTournamentRulesInput(value),
  );

  const roundRobinMin = requireInteger(config.roundRobin.minPlayers, 'tournamentRules.roundRobin.minPlayers', 2);
  const roundRobinMax = requireInteger(config.roundRobin.maxPlayers, 'tournamentRules.roundRobin.maxPlayers', roundRobinMin);

  const playoffMin = requireInteger(config.playoff.minPlayers, 'tournamentRules.playoff.minPlayers', 2);
  const seedDivisor = requireInteger(config.playoff.seedDivisor, 'tournamentRules.playoff.seedDivisor', 1);

  const rrPrelim = validatePreliminaryGroupRules(
    config.preliminaryWithFinalRoundRobin,
    'tournamentRules.preliminaryWithFinalRoundRobin',
  );
  const playoffPrelimBase = validatePreliminaryGroupRules(
    config.preliminaryWithFinalPlayoff,
    'tournamentRules.preliminaryWithFinalPlayoff',
  );
  const playoffPrelim: PreliminaryWithFinalPlayoffRulesConfig = {
    ...playoffPrelimBase,
    qualifiersPerGroup: requireInteger(
      (config.preliminaryWithFinalPlayoff as PreliminaryWithFinalPlayoffRulesConfig).qualifiersPerGroup,
      'tournamentRules.preliminaryWithFinalPlayoff.qualifiersPerGroup',
      1,
      playoffPrelimBase.groupSizeMax,
    ),
  };

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
    multiRoundRobins: (() => {
      const minGroupSize = requireInteger(config.multiRoundRobins.minGroupSize, 'tournamentRules.multiRoundRobins.minGroupSize', 2);
      return {
        minPlayers: requireInteger(config.multiRoundRobins.minPlayers, 'tournamentRules.multiRoundRobins.minPlayers', 2),
        minGroupSize,
        maxGroupSize: requireInteger(config.multiRoundRobins.maxGroupSize, 'tournamentRules.multiRoundRobins.maxGroupSize', minGroupSize),
        minGroups: requireInteger(config.multiRoundRobins.minGroups, 'tournamentRules.multiRoundRobins.minGroups', 2),
      };
    })(),
    preliminaryWithFinalRoundRobin: {
      ...rrPrelim,
      finalRoundRobinSizeDefault: requireInteger(
        (config.preliminaryWithFinalRoundRobin as PreliminaryWithFinalRoundRobinRulesConfig).finalRoundRobinSizeDefault,
        'tournamentRules.preliminaryWithFinalRoundRobin.finalRoundRobinSizeDefault',
        2,
      ),
    },
    preliminaryWithFinalPlayoff: playoffPrelim,
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

function normalizeClubPlansInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const raw = { ...value };
  // Migrate legacy key categories → segments
  if (!Array.isArray(raw.segments) && Array.isArray(raw.categories)) {
    raw.segments = raw.categories;
  }
  delete raw.categories;
  return raw;
}

function validateClubPlans(value: unknown): ClubPlansConfig {
  const config = deepMerge(getDefaultSystemConfig().clubPlans, normalizeClubPlansInput(value));

  if (!Array.isArray(config.segments) || config.segments.length === 0) {
    throw new Error('clubPlans.segments must include at least one segment');
  }
  const segments = config.segments.map((seg: unknown, i: number) => {
    if (typeof seg !== 'string' || seg.trim() === '') {
      throw new Error(`clubPlans.segments[${i}] must be a non-empty string`);
    }
    const trimmed = seg.trim();
    return trimmed === 'Normal' ? 'Regular' : trimmed;
  });
  const unique = Array.from(new Set(segments));
  if (!unique.includes('Regular')) {
    throw new Error('clubPlans.segments must include "Regular"');
  }

  const visitPricingFormula: Record<string, VisitPricingFormulaParams> = {};
  if (isRecord(config.visitPricingFormula)) {
    for (const [key, val] of Object.entries(config.visitPricingFormula)) {
      if (!isRecord(val)) continue;
      const formulaKey = key === 'Normal' ? 'Regular' : key;
      visitPricingFormula[formulaKey] = {
        basePricePerVisitCents: requireInteger(
          (val as Record<string, unknown>).basePricePerVisitCents,
          `clubPlans.visitPricingFormula.${formulaKey}.basePricePerVisitCents`,
          1,
        ),
        exponent: typeof (val as Record<string, unknown>).exponent === 'number'
          ? (val as Record<string, unknown>).exponent as number
          : 0.08,
      };
    }
  }

  return { segments: unique, visitPricingFormula };
}

function coerceAchievementDisplayCount(value: unknown, path: string): number {
  // Migrate legacy booleans: true → 10, false → 0
  if (typeof value === 'boolean') {
    return value ? 10 : 0;
  }
  return requireInteger(value, path, 0, 100);
}

function validatePublicAccess(value: unknown): PublicAccessConfig {
  const config = deepMerge(getDefaultSystemConfig().publicAccess, value);
  const achievementsRaw: Record<string, unknown> = isRecord(config.achievements)
    ? (config.achievements as Record<string, unknown>)
    : {};
  const achievements = {} as AchievementsPublicAccessConfig;
  for (const id of ACHIEVEMENT_CATEGORY_IDS) {
    achievements[id] = coerceAchievementDisplayCount(
      achievementsRaw[id] ?? 0,
      `publicAccess.achievements.${id}`,
    );
  }
  return { achievements };
}

function validatePayments(value: unknown): PaymentsConfig {
  const config = deepMerge(getDefaultSystemConfig().payments, value);
  if (typeof config.providerId !== 'string') {
    throw new Error('payments.providerId must be a string');
  }
  if (!Array.isArray(config.adminNotifyEmails)) {
    throw new Error('payments.adminNotifyEmails must be an array');
  }
  config.adminNotifyEmails = config.adminNotifyEmails
    .map((e) => String(e).trim())
    .filter(Boolean);
  if (config.notifyAdminsOnCourtesy && config.adminNotifyEmails.length < 1) {
    // Allow empty during bootstrap; UI should require ≥1 when enabling notify
  }
  config.courtesyGraceDays = Math.max(0, Math.floor(Number(config.courtesyGraceDays) || 0));
  config.courtesyExtraVisits = Math.max(0, Math.floor(Number(config.courtesyExtraVisits) || 0));
  config.reminders.checkInBannerEnabled = Boolean(config.reminders.checkInBannerEnabled);
  config.reminders.emailEnabled = Boolean(config.reminders.emailEnabled);
  config.reminders.periodDaysBeforeExpiry = Math.max(
    0,
    Math.floor(Number(config.reminders.periodDaysBeforeExpiry) || 0),
  );
  config.reminders.visitPackVisitsRemaining = Math.max(
    0,
    Math.floor(Number(config.reminders.visitPackVisitsRemaining) || 0),
  );
  config.notifyAdminsOnCourtesy = Boolean(config.notifyAdminsOnCourtesy);
  return config;
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
    clubPlans: validateClubPlans(merged.clubPlans),
    publicAccess: validatePublicAccess(merged.publicAccess),
    payments: validatePayments(merged.payments),
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
      clubPlans: toPrismaJson(config.clubPlans),
      publicAccess: toPrismaJson(config.publicAccess),
      payments: toPrismaJson(config.payments),
    },
    update: {
      branding: toPrismaJson(config.branding),
      authPolicy: toPrismaJson(config.authPolicy),
      preregistration: toPrismaJson(config.preregistration),
      ratingValidation: toPrismaJson(config.ratingValidation),
      tournamentRules: toPrismaJson(config.tournamentRules),
      clientRuntime: toPrismaJson(config.clientRuntime),
      clubPlans: toPrismaJson(config.clubPlans),
      publicAccess: toPrismaJson(config.publicAccess),
      payments: toPrismaJson(config.payments),
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
        clubPlans: row.clubPlans,
        publicAccess: (row as { publicAccess?: unknown }).publicAccess,
        payments: (row as { payments?: unknown }).payments,
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

export function getClubPlansConfig(): ClubPlansConfig {
  return getSystemConfig().clubPlans;
}

export function getPaymentsConfig(): PaymentsConfig {
  return getSystemConfig().payments;
}

export function getPublicAccessConfig(): PublicAccessConfig {
  return getSystemConfig().publicAccess;
}

export function hasAnyAchievementEnabled(): boolean {
  const achievements = getSystemConfig().publicAccess.achievements;
  return ACHIEVEMENT_CATEGORY_IDS.some((id) => achievements[id] > 0);
}

export function getAchievementDisplayLimit(id: AchievementCategoryId): number {
  return getSystemConfig().publicAccess.achievements[id] ?? 0;
}
