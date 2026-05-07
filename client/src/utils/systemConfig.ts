import api from './api';

export type SystemConfig = {
  branding: {
    clubName: string | null;
  };
  authPolicy: {
    minimumPasswordLength: number;
    passwordResetTokenTtlHours: number;
  };
  preregistration: {
    defaultTournamentOffsetDays: number;
    defaultTournamentTime: string;
    registrationDeadlineOffsetMinutes: number;
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
  clientRuntime: {
    tournamentsListCacheTtlMs: number;
    socketReconnectionDelayMs: number;
    socketReconnectionAttempts: number;
  };
};

export type SystemConfigPatch = Partial<{
  [K in keyof SystemConfig]: Partial<SystemConfig[K]>;
}>;

const defaultSystemConfig: SystemConfig = {
  branding: {
    clubName: null,
  },
  authPolicy: {
    minimumPasswordLength: 6,
    passwordResetTokenTtlHours: 1,
  },
  preregistration: {
    defaultTournamentOffsetDays: 1,
    defaultTournamentTime: '18:00',
    registrationDeadlineOffsetMinutes: 30,
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
  cachedSystemConfig = deepMerge(defaultSystemConfig, config);
  listeners.forEach(listener => listener(cachedSystemConfig));
  return cachedSystemConfig;
}

export function getSystemConfig(): SystemConfig {
  return cachedSystemConfig;
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
