-- AlterTable
ALTER TABLE "system_config" ADD COLUMN "lessons" JSONB NOT NULL DEFAULT '{}';

-- CreateEnum
CREATE TYPE "IndividualLessonStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
CREATE TYPE "GroupRegistrationStatus" AS ENUM ('REGISTERED', 'WAITLIST', 'DROPPED');
CREATE TYPE "LessonLifecycleActorType" AS ENUM ('ADMIN', 'COACH', 'PLAYER', 'SYSTEM');
CREATE TYPE "LessonLifecycleAction" AS ENUM (
  'PLACE',
  'REGISTER',
  'WAITLIST',
  'DROP',
  'CANCEL',
  'PROMOTE',
  'RATE_REDUCE',
  'CLASS_CREATE',
  'CLASS_RUN_BELOW_MIN',
  'AVAILABILITY_CANCEL'
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL DEFAULT '',
    "teachingActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coach_profiles_memberId_key" ON "coach_profiles"("memberId");
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coach_availability_series" (
    "id" SERIAL NOT NULL,
    "coachProfileId" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "weekdays" TEXT[],
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "startsOn" TEXT NOT NULL,
    "untilOn" TEXT,
    "ratingMin" INTEGER,
    "ratingMax" INTEGER,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_availability_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coach_availability_series_coachProfileId_idx" ON "coach_availability_series"("coachProfileId");
ALTER TABLE "coach_availability_series" ADD CONSTRAINT "coach_availability_series_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coach_availability_occurrences" (
    "id" SERIAL NOT NULL,
    "seriesId" INTEGER NOT NULL,
    "clubDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "ratingMin" INTEGER,
    "ratingMax" INTEGER,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_availability_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coach_availability_occurrences_seriesId_clubDate_key" ON "coach_availability_occurrences"("seriesId", "clubDate");
CREATE INDEX "coach_availability_occurrences_clubDate_idx" ON "coach_availability_occurrences"("clubDate");
CREATE INDEX "coach_availability_occurrences_seriesId_cancelled_idx" ON "coach_availability_occurrences"("seriesId", "cancelled");
ALTER TABLE "coach_availability_occurrences" ADD CONSTRAINT "coach_availability_occurrences_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "coach_availability_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "individual_lesson_series" (
    "id" SERIAL NOT NULL,
    "coachProfileId" INTEGER NOT NULL,
    "playerMemberId" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "weekdays" TEXT[],
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "startsOn" TEXT NOT NULL,
    "untilOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_lesson_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "individual_lesson_series_coachProfileId_idx" ON "individual_lesson_series"("coachProfileId");
CREATE INDEX "individual_lesson_series_playerMemberId_idx" ON "individual_lesson_series"("playerMemberId");
ALTER TABLE "individual_lesson_series" ADD CONSTRAINT "individual_lesson_series_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "individual_lesson_series" ADD CONSTRAINT "individual_lesson_series_playerMemberId_fkey" FOREIGN KEY ("playerMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "individual_lessons" (
    "id" SERIAL NOT NULL,
    "seriesId" INTEGER,
    "coachProfileId" INTEGER NOT NULL,
    "playerMemberId" INTEGER NOT NULL,
    "availabilityOccurrenceId" INTEGER,
    "clubDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "studentCancelHoursOverride" INTEGER,
    "status" "IndividualLessonStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledByMemberId" INTEGER,
    "paymentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_lessons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "individual_lessons_coachProfileId_clubDate_status_idx" ON "individual_lessons"("coachProfileId", "clubDate", "status");
CREATE INDEX "individual_lessons_playerMemberId_clubDate_status_idx" ON "individual_lessons"("playerMemberId", "clubDate", "status");
CREATE INDEX "individual_lessons_paymentId_idx" ON "individual_lessons"("paymentId");
ALTER TABLE "individual_lessons" ADD CONSTRAINT "individual_lessons_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "individual_lesson_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "individual_lessons" ADD CONSTRAINT "individual_lessons_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "individual_lessons" ADD CONSTRAINT "individual_lessons_playerMemberId_fkey" FOREIGN KEY ("playerMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "individual_lessons" ADD CONSTRAINT "individual_lessons_availabilityOccurrenceId_fkey" FOREIGN KEY ("availabilityOccurrenceId") REFERENCES "coach_availability_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "individual_lessons" ADD CONSTRAINT "individual_lessons_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "club_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "group_classes" (
    "id" SERIAL NOT NULL,
    "creatorCoachProfileId" INTEGER NOT NULL,
    "publicCode" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "pricePerOccurrenceCents" INTEGER NOT NULL,
    "minParticipants" INTEGER NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "ratingMin" INTEGER,
    "ratingMax" INTEGER,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "startsOn" TEXT NOT NULL,
    "untilOn" TEXT,
    "firstSessionDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "occurrenceDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_classes_publicCode_key" ON "group_classes"("publicCode");
CREATE INDEX "group_classes_creatorCoachProfileId_idx" ON "group_classes"("creatorCoachProfileId");
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_creatorCoachProfileId_fkey" FOREIGN KEY ("creatorCoachProfileId") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "group_class_slots" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "weekday" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,

    CONSTRAINT "group_class_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_class_slots_classId_weekday_key" ON "group_class_slots"("classId", "weekday");
ALTER TABLE "group_class_slots" ADD CONSTRAINT "group_class_slots_classId_fkey" FOREIGN KEY ("classId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_class_coaches" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "coachProfileId" INTEGER NOT NULL,
    "splitPercent" INTEGER NOT NULL,

    CONSTRAINT "group_class_coaches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_class_coaches_classId_coachProfileId_key" ON "group_class_coaches"("classId", "coachProfileId");
CREATE INDEX "group_class_coaches_coachProfileId_idx" ON "group_class_coaches"("coachProfileId");
ALTER TABLE "group_class_coaches" ADD CONSTRAINT "group_class_coaches_classId_fkey" FOREIGN KEY ("classId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_class_coaches" ADD CONSTRAINT "group_class_coaches_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "group_class_occurrences" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "clubDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "runBelowMin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_class_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_class_occurrences_classId_clubDate_startTime_key" ON "group_class_occurrences"("classId", "clubDate", "startTime");
CREATE INDEX "group_class_occurrences_clubDate_idx" ON "group_class_occurrences"("clubDate");
ALTER TABLE "group_class_occurrences" ADD CONSTRAINT "group_class_occurrences_classId_fkey" FOREIGN KEY ("classId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_class_registrations" (
    "id" SERIAL NOT NULL,
    "occurrenceId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "status" "GroupRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "waitlistPosition" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "paymentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_class_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_class_registrations_occurrenceId_memberId_key" ON "group_class_registrations"("occurrenceId", "memberId");
CREATE INDEX "group_class_registrations_memberId_status_idx" ON "group_class_registrations"("memberId", "status");
CREATE INDEX "group_class_registrations_paymentId_idx" ON "group_class_registrations"("paymentId");
ALTER TABLE "group_class_registrations" ADD CONSTRAINT "group_class_registrations_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "group_class_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_class_registrations" ADD CONSTRAINT "group_class_registrations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_class_registrations" ADD CONSTRAINT "group_class_registrations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "club_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "lesson_lifecycle_events" (
    "id" SERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "LessonLifecycleAction" NOT NULL,
    "actorType" "LessonLifecycleActorType" NOT NULL,
    "actorMemberId" INTEGER,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "details" JSONB,

    CONSTRAINT "lesson_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lesson_lifecycle_events_occurredAt_idx" ON "lesson_lifecycle_events"("occurredAt");
CREATE INDEX "lesson_lifecycle_events_entityType_entityId_idx" ON "lesson_lifecycle_events"("entityType", "entityId");
CREATE INDEX "lesson_lifecycle_events_actorMemberId_idx" ON "lesson_lifecycle_events"("actorMemberId");
ALTER TABLE "lesson_lifecycle_events" ADD CONSTRAINT "lesson_lifecycle_events_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
