import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { bumpPresenceBoardVersion } from '../payments/presenceBoardVersion';
import { invalidateTournamentDetailCache } from './tournamentDetailCache';

let ioInstance: Server | null = null;

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/** Lean fields for client tournament name-list cache patching. */
function leanNameListSocketFields(tournament: any): Record<string, unknown> {
  if (typeof tournament === 'number') {
    return { id: tournament };
  }
  return {
    id: tournament.id,
    name: tournament.name ?? null,
    status: tournament.status,
    type: tournament.type,
    cancelled: Boolean(tournament.cancelled),
    parentTournamentId: tournament.parentTournamentId ?? null,
    createdAt: toIsoOrNull(tournament.createdAt),
    recordedAt: toIsoOrNull(tournament.recordedAt),
    tournamentDate: toIsoOrNull(tournament.tournamentDate),
  };
}

/**
 * Set the Socket.io server instance
 */
export function setIO(io: Server) {
  ioInstance = io;
  logger.info('Socket.io server instance set');
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): Server | null {
  return ioInstance;
}

/**
 * Emit event to all connected clients
 */
export function emitToAll(event: string, data: any) {
  if (ioInstance) {
    ioInstance.emit(event, data);
    logger.debug('Emitted event to all clients', { event, dataKeys: Object.keys(data || {}) });
  } else {
    logger.warn('Attempted to emit event but Socket.io not initialized', { event });
  }
}

/**
 * Emit event to a specific room
 */
export function emitToRoom(room: string, event: string, data: any) {
  if (ioInstance) {
    ioInstance.to(room).emit(event, data);
    logger.debug('Emitted event to room', { room, event, dataKeys: Object.keys(data || {}) });
  } else {
    logger.warn('Attempted to emit event to room but Socket.io not initialized', { room, event });
  }
}

/**
 * Emit cache invalidation event
 * Notifies clients that tournament data has changed and cache should be refreshed
 */
export function emitCacheInvalidation(tournamentId?: number) {
  if (typeof tournamentId === 'number') {
    invalidateTournamentDetailCache(tournamentId);
  }
  emitToAll('cache:invalidate', {
    tournamentId,
    timestamp: Date.now(),
  });
}

/**
 * Emit system configuration update event.
 * Clients use this to refresh public runtime settings immediately.
 */
export function emitSystemConfigUpdated() {
  emitToAll('system:configUpdated', {
    timestamp: Date.now(),
  });
}

/**
 * Emit tournament update event
 */
export function emitTournamentUpdate(tournament: any) {
  const id = typeof tournament === 'number' ? tournament : tournament.id;
  if (typeof id === 'number') {
    invalidateTournamentDetailCache(id);
  }
  emitToAll('tournament:updated', {
    ...leanNameListSocketFields(tournament),
    timestamp: Date.now(),
  });
}

/**
 * Notify clients that preregistration eligibility / pending badge may have changed.
 * Used to refresh nav pending-count without polling.
 */
export function emitPreregistrationChanged(tournamentId?: number) {
  emitToAll('preregistration:changed', {
    tournamentId,
    timestamp: Date.now(),
  });
}

/**
 * Emit tournament creation event
 */
export function emitTournamentCreated(tournament: any) {
  emitToAll('tournament:created', {
    ...leanNameListSocketFields(tournament),
    timestamp: Date.now(),
  });
}

/**
 * Emit tournament deletion event
 */
export function emitTournamentDeleted(tournamentId: number) {
  invalidateTournamentDetailCache(tournamentId);
  emitToAll('tournament:deleted', {
    id: tournamentId,
    timestamp: Date.now(),
  });
}

/**
 * Emit tournament state change event
 */
export function emitTournamentStateChanged(tournament: any, previousStatus?: string | null) {
  emitToAll('tournament:stateChanged', {
    ...leanNameListSocketFields(tournament),
    previousStatus,
    timestamp: Date.now(),
  });
}

/**
 * Emit match update event
 */
export function emitMatchUpdate(match: any, tournamentId: number | null) {
  if (typeof tournamentId === 'number') {
    invalidateTournamentDetailCache(tournamentId);
  }
  emitToAll('match:updated', {
    id: match.id,
    tournamentId,
    member1Id: match.member1Id,
    member2Id: match.member2Id,
    timestamp: Date.now(),
  });
}

/**
 * Notify clients that a club payment reached a terminal (or updated) status.
 */
export function emitPaymentUpdated(payment: {
  id: number;
  memberId: number;
  status: string;
  amountCents: number;
  provider?: string | null;
  purpose?: string | null;
}) {
  emitToAll('payment:updated', {
    id: payment.id,
    memberId: payment.memberId,
    status: payment.status,
    amountCents: payment.amountCents,
    provider: payment.provider ?? null,
    purpose: payment.purpose ?? null,
    timestamp: Date.now(),
  });
}

/**
 * Notify clients that club attendance changed (check-in, check-out, or rejected attempt).
 * Always bumps the presence-board version so clients can detect missed events.
 */
export function emitClubVisitUpdated(payload: {
  memberId: number;
  action: string;
  clubDate?: string | null;
  visitId?: number | null;
  /** When set, clients may patch local status without a full today-status fetch. */
  present?: boolean;
  visitedToday?: boolean;
  lastCheckInAt?: string | null;
  /** Open visit covered by event admission (null/omit clears on clients that track it). */
  eventTournamentId?: number | null;
  eventName?: string | null;
}) {
  const version = bumpPresenceBoardVersion();
  emitToAll('club:visitUpdated', {
    memberId: payload.memberId,
    action: payload.action,
    clubDate: payload.clubDate ?? null,
    visitId: payload.visitId ?? null,
    version,
    present: payload.present,
    visitedToday: payload.visitedToday,
    lastCheckInAt: payload.lastCheckInAt ?? null,
    eventTournamentId:
      payload.eventTournamentId === undefined ? undefined : payload.eventTournamentId,
    eventName: payload.eventName === undefined ? undefined : payload.eventName,
    timestamp: Date.now(),
  });
}

