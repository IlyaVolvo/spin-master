-- Membership lifecycle audit (Admin Membership Log). Survives member hard-delete (no FK).

CREATE TYPE "MemberLifecycleAction" AS ENUM (
  'APPLY',
  'APPLY_RESEND',
  'ACTIVATE',
  'DEACTIVATE',
  'DENY',
  'DELETE'
);

CREATE TYPE "MemberLifecycleActorType" AS ENUM (
  'PUBLIC',
  'ADMIN',
  'SYSTEM'
);

CREATE TABLE "member_lifecycle_events" (
  "id" SERIAL NOT NULL,
  "memberId" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" "MemberLifecycleAction" NOT NULL,
  "actorType" "MemberLifecycleActorType" NOT NULL,
  "actorMemberId" INTEGER,
  "summary" TEXT NOT NULL,
  "details" JSONB,
  CONSTRAINT "member_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_lifecycle_events_occurredAt_idx" ON "member_lifecycle_events"("occurredAt");
CREATE INDEX "member_lifecycle_events_memberId_idx" ON "member_lifecycle_events"("memberId");
CREATE INDEX "member_lifecycle_events_action_idx" ON "member_lifecycle_events"("action");
