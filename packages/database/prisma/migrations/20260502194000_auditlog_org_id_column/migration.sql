-- Align AuditLog with Prisma: tenantId field maps to physical orgId column.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."AuditLog" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;
