-- Add missing Org.allowedEmailDomains for Prisma Tenant model.
-- Supports both quikit."Org" (v4) and public."Org" fallback.

DO $$ BEGIN
  IF to_regclass('quikit."Org"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'quikit' AND table_name = 'Org' AND column_name = 'allowedEmailDomains'
     ) THEN
    ALTER TABLE quikit."Org"
      ADD COLUMN "allowedEmailDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Org"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Org' AND column_name = 'allowedEmailDomains'
     ) THEN
    ALTER TABLE public."Org"
      ADD COLUMN "allowedEmailDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;
