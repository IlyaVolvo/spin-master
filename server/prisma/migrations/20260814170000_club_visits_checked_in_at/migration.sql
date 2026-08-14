-- Align club_visits with schema.prisma @map (checkedInAt / checkedOutAt).
-- Clean migrate deploy created checkInAt/checkOutAt; db push used the mapped names.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_visits' AND column_name = 'checkInAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_visits' AND column_name = 'checkedInAt'
  ) THEN
    ALTER TABLE "club_visits" RENAME COLUMN "checkInAt" TO "checkedInAt";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_visits' AND column_name = 'checkOutAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_visits' AND column_name = 'checkedOutAt'
  ) THEN
    ALTER TABLE "club_visits" RENAME COLUMN "checkOutAt" TO "checkedOutAt";
  END IF;
END $$;
