import { Server } from 'socket.io';
import { logger } from '../utils/logger';

let ioInstance: Server | null = null;

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
  emitToAll('cache:invalidate', {
    tournamentId,
    timestamp: Date.now(),
  });
}

/**
 * Emit tournament update event
 */
export function emitTournamentUpdate(tournament: any) {
  emitToAll('tournament:updated', {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    type: tournament.type,
    timestamp: Date.now(),
  });
}

/**
 * Emit match update event
 */
export function emitMatchUpdate(match: any, tournamentId: number) {
  emitToAll('match:updated', {
    id: match.id,
    tournamentId,
    member1Id: match.member1Id,
    member2Id: match.member2Id,
    timestamp: Date.now(),
  });
}

