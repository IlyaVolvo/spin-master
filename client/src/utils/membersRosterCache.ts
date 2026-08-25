import type { Socket } from 'socket.io-client';
import type { Member } from '../types/member';

export const membersCache: {
  data: Member[] | null;
  lastFetch: number;
} = {
  data: null,
  lastFetch: 0,
};

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

export function subscribeMembersRoster(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMembersRoster(members: Member[]): void {
  membersCache.data = members;
  membersCache.lastFetch = Date.now();
  notify();
}

export function clearMembersRosterCache(): void {
  membersCache.data = null;
  membersCache.lastFetch = 0;
  notify();
}

function isAdminRoster(): boolean {
  return Boolean(membersCache.data?.some((row) => row.planIndicator != null));
}

function shouldKeepPlayer(player: Member): boolean {
  if (Array.isArray(player.roles) && player.roles.includes('PLAYER')) return true;
  const rows = membersCache.data;
  if (!rows) return false;
  if (isAdminRoster()) return true;
  if (rows.some((row) => row.id === player.id)) return true;
  return rows.some((row) => Array.isArray(row.roles) && !row.roles.includes('PLAYER'));
}

function mergePlayer(player: Member, prev?: Member): Member {
  return {
    ...player,
    planIndicator: player.planIndicator ?? prev?.planIndicator ?? (isAdminRoster() ? 'none' : undefined),
  };
}

function isRosterMember(value: unknown): value is Member {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Member).id === 'number' &&
    Number.isInteger((value as Member).id)
  );
}

/** Upsert a newly created member. No-op when the roster cache has not been loaded. */
export function applyPlayerCreated(player: unknown): boolean {
  if (!membersCache.data || !isRosterMember(player) || !shouldKeepPlayer(player)) {
    return false;
  }
  const idx = membersCache.data.findIndex((row) => row.id === player.id);
  const merged = mergePlayer(player, idx >= 0 ? membersCache.data[idx] : undefined);
  if (idx >= 0) {
    const next = [...membersCache.data];
    next[idx] = merged;
    membersCache.data = next;
  } else {
    membersCache.data = [...membersCache.data, merged];
  }
  membersCache.lastFetch = Date.now();
  notify();
  return idx < 0;
}

/** Patch an existing member, or add them if they were missing from the loaded roster. */
export function applyPlayerUpdated(player: unknown): void {
  if (!membersCache.data || !isRosterMember(player)) {
    return;
  }
  const idx = membersCache.data.findIndex((row) => row.id === player.id);
  if (!shouldKeepPlayer(player)) {
    if (idx >= 0) {
      membersCache.data = membersCache.data.filter((row) => row.id !== player.id);
      membersCache.lastFetch = Date.now();
      notify();
    }
    return;
  }
  const merged = mergePlayer(player, idx >= 0 ? membersCache.data[idx] : undefined);
  if (idx >= 0) {
    const next = [...membersCache.data];
    next[idx] = merged;
    membersCache.data = next;
  } else {
    membersCache.data = [...membersCache.data, merged];
  }
  membersCache.lastFetch = Date.now();
  notify();
}

export function applyPlayerDeleted(playerId: unknown): void {
  if (!membersCache.data || typeof playerId !== 'number' || !Number.isInteger(playerId)) {
    return;
  }
  const next = membersCache.data.filter((row) => row.id !== playerId);
  if (next.length === membersCache.data.length) {
    return;
  }
  membersCache.data = next;
  membersCache.lastFetch = Date.now();
  notify();
}

/** CSV / archive import: drop the cache so mounted roster views refetch. */
export function applyPlayersImported(): void {
  if (membersCache.data === null) {
    return;
  }
  membersCache.data = null;
  membersCache.lastFetch = 0;
  notify();
}

/** Keep the Players roster cache current for the whole authenticated session. */
export function bindPlayerRosterSocket(socket: Socket | null): () => void {
  if (!socket) {
    return () => {};
  }
  const onCreated = (data: { player?: unknown }) => {
    applyPlayerCreated(data?.player);
  };
  const onUpdated = (data: { player?: unknown }) => {
    applyPlayerUpdated(data?.player);
  };
  const onDeleted = (data: { playerId?: unknown }) => {
    applyPlayerDeleted(data?.playerId);
  };
  const onImported = () => {
    applyPlayersImported();
  };
  socket.on('player:created', onCreated);
  socket.on('player:updated', onUpdated);
  socket.on('player:deleted', onDeleted);
  socket.on('players:imported', onImported);
  return () => {
    socket.off('player:created', onCreated);
    socket.off('player:updated', onUpdated);
    socket.off('player:deleted', onDeleted);
    socket.off('players:imported', onImported);
  };
}
