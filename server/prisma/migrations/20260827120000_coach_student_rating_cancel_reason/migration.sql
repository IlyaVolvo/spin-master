ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "studentRatingMin" INTEGER;
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "studentRatingMax" INTEGER;
ALTER TABLE "individual_lessons" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
