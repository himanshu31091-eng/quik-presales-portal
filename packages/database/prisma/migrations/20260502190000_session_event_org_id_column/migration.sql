-- Align public.SessionEvent with Prisma: tenantId field maps to column orgId (v4 naming).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SessionEvent' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."SessionEvent" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;
