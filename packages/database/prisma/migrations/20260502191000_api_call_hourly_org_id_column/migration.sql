-- ApiCallHourlyRollup.tenantId in Prisma maps to column orgId; DB was created with tenantId.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ApiCallHourlyRollup' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."ApiCallHourlyRollup" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;
