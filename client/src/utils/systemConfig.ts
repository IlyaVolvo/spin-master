import api, { DEFAULT_API_REQUEST_TIMEOUT_MS } from './api';

export const ACHIEVEMENT_CATEGORY_IDS = [
  'biggest_upset',
  'most_wins',
  'most_active',
  'underdog_champion',
  'club_ladder_movers',
] as const;

export type AchievementCategoryId = (typeof ACHIEVEMENT_CATEGORY_IDS)[number];

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategoryId, string> = {
  biggest_upset: 'Biggest upset',
  most_wins: 'Most wins',
  most_active: 'Most active',
  underdog_champion: 'Underdog champion',
  club_ladder_movers: 'Club ladder movers',
};

export type ClubWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ClubDayHours =
  | { closed: true }
  | { closed: false; open: string; close: string };

export type ClubHourOverride = {
  date: string;
  hours: ClubDayHours;
  comment: string | null;
};

export type SystemConfig = {
  branding: {
    clubName: string | null;
    clubTimezone: string;
    weeklyHours: Record<ClubWeekday, ClubDayHours>;
    hourOverrides: ClubHourOverride[];
  };
  authPolicy: {
    minimumPasswordLength: number;
    passwordResetTokenTtlHours: number;
    pinLength: number;
    autoRelinquishPrivileges: boolean;
    autoRelinquishIdleMinutes: number;
  };
  preregistration: {
    defaultTournamentOffsetDays: number;
    defaultTournamentTime: string;
    registrationDeadlineOffsetMinutes: number;
    eventCheckInLeadMinutes: number;
    eventCheckInCloseMinutesBeforeStart: number;
    defaultEventPriceCents: number;
    cancelReasonPresets: string[];
  };
  ratingValidation: {
    ratingInputMin: number;
    ratingInputMax: number;
    suspiciousRatingMin: number;
    suspiciousRatingMax: number;
  };
  tournamentRules: {
    roundRobin: {
      minPlayers: number;
      maxPlayers: number;
      earlyCompleteMinPercent: number;
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
      defaultSize: number;
      minGroups: number;
    };
    preliminaryWithFinalRoundRobin: {
      groupSizeMin: number;
      groupSizeMax: number;
      groupSizeDefault: number;
      finalRoundRobinSizeDefault: number;
      reservedFinalSpotsForAutoQualified: number;
    };
    preliminaryWithFinalPlayoff: {
      groupSizeMin: number;
      groupSizeMax: number;
      groupSizeDefault: number;
      reservedFinalSpotsForAutoQualified: number;
      qualifiersPerGroup: number;
    };
    matchScore: {
      min: number;
      max: number;
      allowEqualScores: boolean;
    };
  };
  clientRuntime: {
    tournamentsListCacheTtlMs: number;
    socketReconnectionDelayMs: number;
    socketReconnectionAttempts: number;
    apiRequestTimeoutMs: number;
  };
  clubPlans: {
    segments: string[];
  };
  publicAccess: {
    achievements: Record<AchievementCategoryId, number>;
  };
  payments: {
    providerId: string;
    defaultOnlinePayConsent: boolean;
    adminNotifyEmails: string[];
    notifyAdminsOnCourtesy: boolean;
    courtesyGraceDays: number;
    courtesyExtraVisits: number;
    newMemberTrialDays: number;
    reminders: {
      checkInBannerEnabled: boolean;
      emailEnabled: boolean;
      periodDaysBeforeExpiry: number;
      visitPackVisitsRemaining: number;
    };
    providers: {
      test: {
        confirmDelayMeanMs: number;
        confirmDelayStdDevMs: number;
      };
      [providerId: string]: Record<string, unknown>;
    };
  };
};

export type SystemConfigPatch = Partial<{
  [K in keyof SystemConfig]: Partial<SystemConfig[K]>;
}>;

const defaultOpenDay: ClubDayHours = { closed: false, open: '10:00', close: '22:00' };
const defaultClosedDay: ClubDayHours = { closed: true };

const defaultSystemConfig: SystemConfig = {
  branding: {
    clubName: null,
    clubTimezone: 'UTC',
    weeklyHours: {
      mon: defaultOpenDay,
      tue: defaultOpenDay,
      wed: defaultOpenDay,
      thu: defaultOpenDay,
      fri: defaultOpenDay,
      sat: defaultClosedDay,
      sun: defaultClosedDay,
    },
    hourOverrides: [],
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
    registrationDeadlineOffsetMinutes: 60,
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
    defaultEventPriceCents: 1000,
    cancelReasonPresets: [
      'Tournament cancelled by organizer',
      'Not enough registered players',
      'Schedule conflict',
      'Venue unavailable',
      'Weather or emergency closure',
    ],
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
      earlyCompleteMinPercent: 70,
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
      defaultSize: 4,
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
    apiRequestTimeoutMs: DEFAULT_API_REQUEST_TIMEOUT_MS,
  },
  clubPlans: {
    segments: ['Regular'],
  },
  publicAccess: {
    achievements: Object.fromEntries(
      ACHIEVEMENT_CATEGORY_IDS.map((id) => [id, 0]),
    ) as Record<AchievementCategoryId, number>,
  },
  payments: {
    providerId: '',
    defaultOnlinePayConsent: false,
    adminNotifyEmails: [],
    notifyAdminsOnCourtesy: true,
    courtesyGraceDays: 7,
    courtesyExtraVisits: 3,
    newMemberTrialDays: 7,
    reminders: {
      checkInBannerEnabled: true,
      emailEnabled: true,
      periodDaysBeforeExpiry: 14,
      visitPackVisitsRemaining: 2,
    },
    providers: {
      test: {
        confirmDelayMeanMs: 2500,
        confirmDelayStdDevMs: 800,
      },
    },
  },
};

let cachedSystemConfig: SystemConfig = defaultSystemConfig;
const listeners = new Set<(config: SystemConfig) => void>();

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

function setCachedSystemConfig(config: unknown): SystemConfig {
  const raw = isRecord(config) ? { ...config } : {};
  if (isRecord(raw.clubPlans)) {
    const clubPlans = { ...raw.clubPlans };
    if (!Array.isArray(clubPlans.segments) && Array.isArray(clubPlans.categories)) {
      clubPlans.segments = clubPlans.categories;
    }
    delete clubPlans.categories;
    raw.clubPlans = clubPlans;
  }
  if (isRecord(raw.tournamentRules)) {
    const rules = { ...raw.tournamentRules };
    if (isRecord(rules.preliminary)) {
      const legacy = rules.preliminary;
      if (!isRecord(rules.preliminaryWithFinalRoundRobin)) {
        rules.preliminaryWithFinalRoundRobin = { ...legacy };
      }
      if (!isRecord(rules.preliminaryWithFinalPlayoff)) {
        rules.preliminaryWithFinalPlayoff = {
          groupSizeMin: legacy.groupSizeMin,
          groupSizeMax: legacy.groupSizeMax,
          groupSizeDefault: legacy.groupSizeDefault,
          reservedFinalSpotsForAutoQualified: legacy.reservedFinalSpotsForAutoQualified,
        };
      }
    }
    delete rules.preliminary;
    raw.tournamentRules = rules;
  }
  cachedSystemConfig = deepMerge(defaultSystemConfig, raw);
  api.defaults.timeout = cachedSystemConfig.clientRuntime.apiRequestTimeoutMs;
  listeners.forEach(listener => listener(cachedSystemConfig));
  return cachedSystemConfig;
}

export function getSystemConfig(): SystemConfig {
  return cachedSystemConfig;
}

export function hasAnyPublicAchievementEnabled(config: SystemConfig = cachedSystemConfig): boolean {
  return ACHIEVEMENT_CATEGORY_IDS.some((id) => (config.publicAccess?.achievements?.[id] ?? 0) > 0);
}

export function subscribeToSystemConfig(listener: (config: SystemConfig) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function calculateSwissDefaultRounds(participantCount: number, maxRoundsDivisor = 2): number {
  const safeParticipantCount = Math.max(participantCount, 2);
  const safeMaxRoundsDivisor = Math.max(maxRoundsDivisor, 1);
  const maxRounds = Math.floor(safeParticipantCount / safeMaxRoundsDivisor);
  const suggestedRounds = Math.ceil(Math.log2(safeParticipantCount)) + 1;
  return Math.max(3, Math.min(suggestedRounds, Math.max(3, maxRounds)));
}

export async function loadPublicSystemConfig(): Promise<SystemConfig> {
  const response = await api.get<SystemConfig>('/config');
  return setCachedSystemConfig(response.data);
}

export async function loadAdminSystemConfig(): Promise<SystemConfig> {
  const response = await api.get<SystemConfig>('/system-config');
  return setCachedSystemConfig(response.data);
}

export async function saveAdminSystemConfig(patch: SystemConfigPatch): Promise<SystemConfig> {
  const response = await api.patch<SystemConfig>('/system-config', patch);
  return setCachedSystemConfig(response.data);
}
