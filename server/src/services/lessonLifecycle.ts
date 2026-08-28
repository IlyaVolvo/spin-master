import { prisma } from '../index';
import type { LessonLifecycleAction, LessonLifecycleActorType, Prisma } from '@prisma/client';

export async function recordLessonLifecycle(params: {
  action: LessonLifecycleAction;
  actorType: LessonLifecycleActorType;
  actorMemberId?: number | null;
  entityType: string;
  entityId: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await prisma.lessonLifecycleEvent.create({
    data: {
      action: params.action,
      actorType: params.actorType,
      actorMemberId: params.actorMemberId ?? null,
      entityType: params.entityType,
      entityId: params.entityId,
      details: (params.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
