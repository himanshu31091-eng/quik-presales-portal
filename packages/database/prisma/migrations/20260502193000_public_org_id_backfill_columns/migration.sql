-- Align remaining public tables with Prisma tenantId @map("orgId").
-- These tables still had physical tenantId columns, causing runtime errors like
-- "Team.orgId does not exist" and "AppModuleFlag.orgId does not exist".

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Team' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."Team" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'UserTeam' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."UserTeam" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AppModuleFlag' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public."AppModuleFlag" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;
