import { prisma } from '../index';
import type { AuthRequest } from '../middleware/auth';
import { logger } from './logger';

/** True if the request is from a member with ORGANIZER role (session or DB). */
export async function isOrganizer(req: AuthRequest): Promise<boolean> {
  logger.debug('Checking organizer status', {
    hasMember: !!req.member,
    hasMemberId: !!req.memberId,
    memberId: req.member?.id || req.memberId,
    memberRoles: req.member?.roles,
  });

  if (req.member && Array.isArray(req.member.roles)) {
    const hasOrganizerRole = req.member.roles.some(
      role => String(role).toUpperCase() === 'ORGANIZER'
    );
    if (hasOrganizerRole) {
      logger.info('Organizer access granted via session', {
        memberId: req.member.id,
        roles: req.member.roles,
      });
      return true;
    }
    logger.debug('Organizer access denied - session member does not have ORGANIZER role', {
      memberId: req.member.id,
      roles: req.member.roles,
    });
  }

  if (req.memberId) {
    try {
      const member = await prisma.member.findUnique({
        where: { id: req.memberId },
        select: { roles: true },
      });

      if (member && Array.isArray(member.roles)) {
        const hasOrganizerRole = member.roles.some(
          role => String(role).toUpperCase() === 'ORGANIZER'
        );
        if (hasOrganizerRole) {
          logger.info('Organizer access granted via database lookup', {
            memberId: req.memberId,
            roles: member.roles,
          });
          return true;
        }
        logger.debug('Organizer access denied - member does not have ORGANIZER role', {
          memberId: req.memberId,
          roles: member.roles,
        });
      } else {
        logger.warn('Organizer access denied - member not found or no roles', {
          memberId: req.memberId,
          memberFound: !!member,
        });
      }
    } catch (error) {
      logger.error('Error checking organizer status in database', {
        error: error instanceof Error ? error.message : String(error),
        memberId: req.memberId,
      });
    }
  } else {
    logger.debug('Organizer access denied - no memberId in request');
  }

  return false;
}
