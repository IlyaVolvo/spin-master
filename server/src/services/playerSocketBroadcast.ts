import type { PrismaClient } from '@prisma/client';
import { stripSensitiveMemberFields } from '../utils/memberSerialization';
import { logger } from '../utils/logger';
import { emitToAll } from './socketService';

/**
 * Notify all connected clients that these members changed (e.g. rating updates from tournaments).
 * Loads fresh rows so payloads match GET /players shape.
 */
export async function broadcastMembersUpdated(prisma: PrismaClient, memberIds: number[]): Promise<void> {
  const ids = [...new Set(memberIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) {
    return;
  }
  try {
    const members = await prisma.member.findMany({ where: { id: { in: ids } } });
    const timestamp = Date.now();
    for (const member of members) {
      emitToAll('player:updated', {
        player: stripSensitiveMemberFields(member),
        timestamp,
      });
    }
  } catch (error) {
    logger.error('broadcastMembersUpdated failed', {
      error: error instanceof Error ? error.message : String(error),
      memberIds: ids,
    });
  }
}
