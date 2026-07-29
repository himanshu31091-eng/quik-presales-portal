-- QuikCRM: API Secret Keys — authentication for the public API layer
-- (`/api/public/*`) used by third-party dashboard integrations. This is NOT
-- OAuth: a caller presents a raw secret via `Authorization: Bearer <key>` or
-- `X-Api-Key`, and we look it up by the SHA-256 hash stored in `keyHash`
-- (unique). `prefix`/`lastFour` render a non-sensitive label; `isActive=false`
-- or a set `revokedAt` disables the key. Scoped to `orgId` like every other
-- CRM row. See apps/quikcrm/lib/api/public-api-auth.ts and the CrmApiKey model
-- in packages/database/prisma/schema.prisma.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply by hand;
-- the build pipeline does not run `migrate deploy`. Table/index/constraint
-- names match Prisma's generated names for @id / @unique / @@index so the
-- generated client stays in sync. Depends on quikit."Org" existing (init).

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmApiKey" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name              text NOT NULL,
  "keyHash"         text NOT NULL,
  prefix            text NOT NULL,
  "lastFour"        text NOT NULL,
  "isActive"        boolean NOT NULL DEFAULT true,
  "lastUsedAt"      timestamp(3),
  "revokedAt"       timestamp(3),
  "createdByUserId" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @unique on keyHash — the lookup key; a raw secret's SHA-256 must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmApiKey_keyHash_key"
  ON app_quikcrm."CrmApiKey" ("keyHash");

-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmApiKey_orgId_idx"
  ON app_quikcrm."CrmApiKey" ("orgId");

-- @@index([orgId, isActive])
CREATE INDEX IF NOT EXISTS "CrmApiKey_orgId_isActive_idx"
  ON app_quikcrm."CrmApiKey" ("orgId", "isActive");
