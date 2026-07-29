-- QuikIT v4 (QuikIT-Database-Architecture-v4-EN.md §3–5, §16):
-- Single DB: identity lives in `auth`, org + app registry in `quikit`.
-- Idempotent: safe if tables were already moved or names already normalized.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS quikit;

-- ── Auth: NextAuth + VerificationToken ─────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public."User"') IS NOT NULL THEN
    ALTER TABLE public."User" SET SCHEMA auth;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Account"') IS NOT NULL THEN
    ALTER TABLE public."Account" SET SCHEMA auth;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Session"') IS NOT NULL THEN
    ALTER TABLE public."Session" SET SCHEMA auth;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."VerificationToken"') IS NOT NULL THEN
    ALTER TABLE public."VerificationToken" SET SCHEMA auth;
  END IF;
END $$;

-- ── Quikit: app registry + OAuth IdP (before org rows that reference App) ─
DO $$ BEGIN
  IF to_regclass('public."App"') IS NOT NULL THEN
    ALTER TABLE public."App" SET SCHEMA quikit;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."OAuthClient"') IS NOT NULL THEN
    ALTER TABLE public."OAuthClient" SET SCHEMA quikit;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."OAuthCode"') IS NOT NULL THEN
    ALTER TABLE public."OAuthCode" SET SCHEMA quikit;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."OAuthRefreshToken"') IS NOT NULL THEN
    ALTER TABLE public."OAuthRefreshToken" SET SCHEMA quikit;
  END IF;
END $$;

-- ── Org root (legacy name Tenant) ─────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public."Org"') IS NOT NULL THEN
    ALTER TABLE public."Org" SET SCHEMA quikit;
  ELSIF to_regclass('public."Tenant"') IS NOT NULL THEN
    ALTER TABLE public."Tenant" SET SCHEMA quikit;
  END IF;
END $$;

-- ── Membership (legacy Membership) ────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public."OrgMember"') IS NOT NULL THEN
    ALTER TABLE public."OrgMember" SET SCHEMA quikit;
  ELSIF to_regclass('public."Membership"') IS NOT NULL THEN
    ALTER TABLE public."Membership" SET SCHEMA quikit;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."UserAppAccess"') IS NOT NULL THEN
    ALTER TABLE public."UserAppAccess" SET SCHEMA quikit;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."OrgAppAccess"') IS NOT NULL THEN
    ALTER TABLE public."OrgAppAccess" SET SCHEMA quikit;
  ELSIF to_regclass('public."TenantAppAccess"') IS NOT NULL THEN
    ALTER TABLE public."TenantAppAccess" SET SCHEMA quikit;
  END IF;
END $$;

-- ── Align physical names with Prisma @@map("Org" | "OrgMember" | "OrgAppAccess")
DO $$ BEGIN
  IF to_regclass('quikit."Tenant"') IS NOT NULL AND to_regclass('quikit."Org"') IS NULL THEN
    ALTER TABLE quikit."Tenant" RENAME TO "Org";
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('quikit."Membership"') IS NOT NULL AND to_regclass('quikit."OrgMember"') IS NULL THEN
    ALTER TABLE quikit."Membership" RENAME TO "OrgMember";
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('quikit."TenantAppAccess"') IS NOT NULL AND to_regclass('quikit."OrgAppAccess"') IS NULL THEN
    ALTER TABLE quikit."TenantAppAccess" RENAME TO "OrgAppAccess";
  END IF;
END $$;

-- ── Column names: Prisma uses tenantId @map("orgId") → DB column orgId ───
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'quikit' AND table_name = 'OrgMember' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE quikit."OrgMember" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'quikit' AND table_name = 'OrgAppAccess' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE quikit."OrgAppAccess" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'quikit' AND table_name = 'UserAppAccess' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE quikit."UserAppAccess" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'quikit' AND table_name = 'OAuthCode' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE quikit."OAuthCode" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'quikit' AND table_name = 'OAuthRefreshToken' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE quikit."OAuthRefreshToken" RENAME COLUMN "tenantId" TO "orgId";
  END IF;
END $$;
