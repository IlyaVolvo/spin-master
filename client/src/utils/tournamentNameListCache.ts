import api from './api';

/** Lean root-tournament row for Name filter autocomplete. */
export type TournamentNameListItem = {
  id: number;
  name: string | null;
  status: string;
  cancelled: boolean;
  createdAt: string;
  recordedAt: string | null;
  tournamentDate: string | null;
};

type NameListSocketPayload = {
  id?: number;
  name?: string | null;
  status?: string;
  cancelled?: boolean;
  parentTournamentId?: number | null;
  createdAt?: string | null;
  recordedAt?: string | null;
  tournamentDate?: string | null;
};

let cache: TournamentNameListItem[] | null = null;
let loadPromise: Promise<TournamentNameListItem[]> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  });
}

function normalizeItem(raw: any): TournamentNameListItem | null {
  if (raw == null || typeof raw.id !== 'number') return null;
  if (raw.parentTournamentId != null) return null;
  return {
    id: raw.id,
    name: raw.name ?? null,
    status: String(raw.status ?? ''),
    cancelled: Boolean(raw.cancelled),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : '',
    recordedAt: raw.recordedAt != null ? String(raw.recordedAt) : null,
    tournamentDate: raw.tournamentDate != null ? String(raw.tournamentDate) : null,
  };
}

export function getTournamentNameList(): TournamentNameListItem[] {
  return cache ?? [];
}

export function subscribeTournamentNameList(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearTournamentNameListCache(): void {
  cache = null;
  loadPromise = null;
  notify();
}

export async function ensureTournamentNameListLoaded(): Promise<TournamentNameListItem[]> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { data } = await api.get('/tournaments/names');
    const rows = Array.isArray(data) ? data : [];
    cache = rows
      .map((row: any) => normalizeItem(row))
      .filter((row: TournamentNameListItem | null): row is TournamentNameListItem => row != null);
    notify();
    return cache;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function upsertItem(item: TournamentNameListItem): void {
  if (!cache) {
    cache = [item];
    notify();
    return;
  }
  const idx = cache.findIndex((row) => row.id === item.id);
  if (idx >= 0) {
    cache = [...cache.slice(0, idx), item, ...cache.slice(idx + 1)];
  } else {
    cache = [item, ...cache];
  }
  notify();
}

function removeItem(id: number): void {
  if (!cache) return;
  const next = cache.filter((row) => row.id !== id);
  if (next.length === cache.length) return;
  cache = next;
  notify();
}

function mergeFromSocket(payload: NameListSocketPayload): TournamentNameListItem | null {
  if (typeof payload.id !== 'number') return null;
  if (payload.parentTournamentId != null) {
    removeItem(payload.id);
    return null;
  }
  const existing = cache?.find((row) => row.id === payload.id);
  if (!existing && (payload.status == null || payload.createdAt == null)) {
    // Incomplete create/update without a loaded cache row — ignore; next full load will pick up.
    return null;
  }
  return {
    id: payload.id,
    name: payload.name !== undefined ? payload.name : (existing?.name ?? null),
    status: payload.status ?? existing?.status ?? '',
    cancelled: payload.cancelled !== undefined ? Boolean(payload.cancelled) : Boolean(existing?.cancelled),
    createdAt: payload.createdAt != null ? String(payload.createdAt) : (existing?.createdAt ?? ''),
    recordedAt:
      payload.recordedAt !== undefined
        ? (payload.recordedAt != null ? String(payload.recordedAt) : null)
        : (existing?.recordedAt ?? null),
    tournamentDate:
      payload.tournamentDate !== undefined
        ? (payload.tournamentDate != null ? String(payload.tournamentDate) : null)
        : (existing?.tournamentDate ?? null),
  };
}

/** Apply tournament socket payloads to the in-memory name list. */
export function applyTournamentNameListSocketEvent(
  event: 'tournament:created' | 'tournament:updated' | 'tournament:stateChanged' | 'tournament:deleted',
  payload: NameListSocketPayload,
): void {
  if (event === 'tournament:deleted') {
    if (typeof payload.id === 'number') removeItem(payload.id);
    return;
  }
  const item = mergeFromSocket(payload);
  if (item) upsertItem(item);
}
