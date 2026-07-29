-- QuikCRM: Prospect conversion state.
--
-- Adds status / convertedLeadId / convertedAt to CrmProspect so a prospect can
-- be converted into a CrmLead from the Prospects settings page. Marked
-- "Converted" (from the default "New") once the lead is created, with a pointer
-- back to the created lead.
--
-- Idempotent (IF NOT EXISTS) — safe to hand-apply; the build pipeline does not
-- run `migrate deploy`. Mirrors the 20260723120000_quikcrm_prospects convention.

ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS "convertedLeadId" text,
  ADD COLUMN IF NOT EXISTS "convertedAt" timestamp(3);

-- @@index([orgId, status]) — list filtering by conversion state.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_status_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "status");
