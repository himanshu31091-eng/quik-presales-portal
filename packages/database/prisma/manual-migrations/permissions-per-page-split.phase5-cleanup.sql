-- ============================================================================
-- Per-Page Permissions Split — Phase 5 CLEANUP (RUN MANUALLY, LAST)
-- ----------------------------------------------------------------------------
-- Removes the retired umbrella resources `construction.masters` and
-- `construction.organization` from the permission tables. After the Phase 4
-- cutover, NO route reads these anymore (routes gate on the per-page
-- construction.master_* / construction.org_* resources), so these rows are
-- dead weight.
--
-- ⚠️ ORDER — run this ONLY when ALL of the following are true for the target
--    environment:
--      1. The Phase 3 migration was run (per-page rows exist).
--      2. The Phase 4 + Phase 5 CODE is deployed and LIVE.
--      3. You have smoke-tested that users still have correct access.
--    Running this while pre-Phase-4 code is live would revoke everyone's
--    Masters/Organization access (that old code still checks construction.masters).
--
-- Safe otherwise: idempotent (a second run deletes nothing), and it only
-- touches the two umbrella resources — per-page rows are untouched.
-- Take a DB backup first on UAT/production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) PRE-CHECK — how many umbrella rows exist (what will be deleted)?
-- ---------------------------------------------------------------------------
-- SELECT 'RolePermission' AS tbl, resource, count(*)
--   FROM app_quikinfra."RolePermission"
--  WHERE resource IN ('construction.masters', 'construction.organization')
--  GROUP BY resource
-- UNION ALL
-- SELECT 'UserPermissionExtra', resource, count(*)
--   FROM app_quikinfra."UserPermissionExtra"
--  WHERE resource IN ('construction.masters', 'construction.organization')
--  GROUP BY resource;

BEGIN;

DELETE FROM app_quikinfra."RolePermission"
 WHERE resource IN ('construction.masters', 'construction.organization');

DELETE FROM app_quikinfra."UserPermissionExtra"
 WHERE resource IN ('construction.masters', 'construction.organization');

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-CHECK (after COMMIT) — both queries should return 0 rows.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM app_quikinfra."RolePermission"
--   WHERE resource IN ('construction.masters', 'construction.organization');
-- SELECT count(*) FROM app_quikinfra."UserPermissionExtra"
--   WHERE resource IN ('construction.masters', 'construction.organization');

-- ---------------------------------------------------------------------------
-- No rollback is provided: the per-page rows (created in Phase 3) fully replace
-- these. If you truly need to undo, re-run the Phase 3 migration logic in
-- reverse is NOT applicable — instead restore from the DB backup you took
-- before running this. That is why the backup is mandatory.
-- ============================================================================
