import type { MemberLifecycleAction, MemberLifecycleActorType, Prisma } from '@prisma/client';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import type { MemberLifecycleChangeEntry } from '../utils/memberSerialization';

export type RecordMemberLifecycleEventParams = {
  memberId: number;
  action: MemberLifecycleAction;
  actorType: MemberLifecycleActorType;
  actorMemberId?: number | null;
  summary: string;
  details?: Prisma.InputJsonValue;
};

/**
 * Append a membership lifecycle row. Never throws to callers — log failures only.
 */
export async function recordMemberLifecycleEvent(
  params: RecordMemberLifecycleEventParams,
): Promise<void> {
  try {
    await prisma.memberLifecycleEvent.create({
      data: {
        memberId: params.memberId,
        action: params.action,
        actorType: params.actorType,
        actorMemberId: params.actorMemberId ?? null,
        summary: params.summary,
        details: params.details ?? undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to record member lifecycle event', {
      memberId: params.memberId,
      action: params.action,
      actorType: params.actorType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function memberLifecycleIdentityDetails(member: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): Prisma.InputJsonValue {
  return {
    firstName: member.firstName ?? null,
    lastName: member.lastName ?? null,
    email: member.email ?? null,
  };
}

export function memberLifecycleUpdateDetails(
  member: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  },
  changes: MemberLifecycleChangeEntry[],
): Prisma.InputJsonValue {
  return {
    firstName: member.firstName ?? null,
    lastName: member.lastName ?? null,
    email: member.email ?? null,
    changes,
  };
}

export function memberDisplayName(member: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = `${member.firstName || ''} ${member.lastName || ''}`.trim();
  if (name) return name;
  if (member.email?.trim()) return member.email.trim();
  return 'Member';
}
