/** Persisted navigation state for the Tournaments area (list stage + last detail). */

export type TournamentStageTab = 'PRE_REGISTRATION' | 'ACTIVE' | 'COMPLETED' | 'MATCHES';

const STAGE_KEY = 'tournaments_lastStage';
const LAST_TOURNAMENT_KEY = 'tournaments_lastTournamentId';
const OPEN_DETAIL_KEY = 'tournaments_restoreDetail';

const VALID_STAGES: TournamentStageTab[] = ['PRE_REGISTRATION', 'ACTIVE', 'COMPLETED', 'MATCHES'];

export function isTournamentStageTab(value: unknown): value is TournamentStageTab {
  return typeof value === 'string' && (VALID_STAGES as string[]).includes(value);
}

export function stageFromTournamentStatus(status: string | undefined | null): TournamentStageTab {
  if (status === 'PRE_REGISTRATION') return 'PRE_REGISTRATION';
  if (status === 'COMPLETED') return 'COMPLETED';
  return 'ACTIVE';
}

export function loadLastStage(): TournamentStageTab {
  try {
    const stored = localStorage.getItem(STAGE_KEY);
    if (isTournamentStageTab(stored)) return stored;
  } catch {
    // ignore
  }
  return 'ACTIVE';
}

export function saveLastStage(stage: TournamentStageTab): void {
  try {
    localStorage.setItem(STAGE_KEY, stage);
  } catch {
    // ignore
  }
}

export function loadLastTournamentId(): number | null {
  try {
    const stored = localStorage.getItem(LAST_TOURNAMENT_KEY);
    if (!stored) return null;
    const id = parseInt(stored, 10);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function saveLastTournamentId(id: number | null): void {
  try {
    if (id == null) {
      localStorage.removeItem(LAST_TOURNAMENT_KEY);
    } else {
      localStorage.setItem(LAST_TOURNAMENT_KEY, String(id));
    }
  } catch {
    // ignore
  }
}

/** When true, returning to /tournaments should open the last detail route. */
export function loadShouldRestoreDetail(): boolean {
  try {
    return localStorage.getItem(OPEN_DETAIL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShouldRestoreDetail(open: boolean): void {
  try {
    if (open) {
      localStorage.setItem(OPEN_DETAIL_KEY, '1');
    } else {
      localStorage.removeItem(OPEN_DETAIL_KEY);
    }
  } catch {
    // ignore
  }
}

export function stageTabLabel(stage: TournamentStageTab): string {
  switch (stage) {
    case 'PRE_REGISTRATION':
      return 'Preregistration';
    case 'ACTIVE':
      return 'Active';
    case 'COMPLETED':
      return 'Completed';
    case 'MATCHES':
      return 'Individual Matches';
  }
}
