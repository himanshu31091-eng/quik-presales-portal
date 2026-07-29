-- One-off DDL for the QtFeedback model in the app_quiktrack schema.
-- Mirrors the Prisma model exactly (no relations on it, so no FKs needed).
CREATE TABLE IF NOT EXISTS "app_quiktrack"."QtFeedback" (
  "id"          TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "projectId"   TEXT,
  "category"    TEXT NOT NULL,
  "content"     TEXT NOT NULL,
  "contactOk"   BOOLEAN NOT NULL DEFAULT false,
  "researchOk"  BOOLEAN NOT NULL DEFAULT false,
  "url"         TEXT,
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QtFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QtFeedback_orgId_createdAt_idx"
  ON "app_quiktrack"."QtFeedback" ("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtFeedback_userId_idx"
  ON "app_quiktrack"."QtFeedback" ("userId");
