-- QuikCRM: Email full-history sync (P2) — adds backfill state + per-folder
-- Microsoft Graph delta cursors to CrmMailboxConnection.
--
-- On connect we run a one-time 90-day backfill of Inbox + Sent Items, then
-- switch to incremental sync. Microsoft delta is a PER-FOLDER operation, so we
-- track inbox and sentitems with separate deltaLinks (deltaInbox / deltaSent).
-- The backfill paginates across cron ticks via backfillCursor + syncState.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it is safe to apply to the shared DB
-- by hand; the build pipeline does not run `migrate deploy`. Mirrors the
-- 20260716120000_quikcrm_email_integration convention. Additive only — no data
-- change to existing rows (defaults backfill new columns).

ALTER TABLE app_quikcrm."CrmMailboxConnection"
  ADD COLUMN IF NOT EXISTS "syncState"      text NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS "backfillCursor" text,
  ADD COLUMN IF NOT EXISTS "backfillSince"  timestamp(3),
  ADD COLUMN IF NOT EXISTS "deltaInbox"     text,
  ADD COLUMN IF NOT EXISTS "deltaSent"      text;
