-- ============================================================================
-- Per-Page Permissions Split — Phase 3 data migration (RUN MANUALLY)
-- ----------------------------------------------------------------------------
-- Purpose: backfill EXISTING orgs so no role/user loses access at the Phase 4
-- cutover. Purely ADDITIVE and IDEMPOTENT — it only INSERTs the new per-page
-- rows and never deletes or updates existing rows. Safe to run more than once.
--
-- WHY both master_* AND org_* derive from `construction.masters`:
--   Today every Masters AND Organization page's API route gates on
--   `construction.masters.<action>` (Organization routes live under
--   /api/masters and use requireMastersAction). So a role/user's CURRENT
--   effective access to an org page is governed by construction.masters, NOT
--   construction.organization (whose grants/revokes are currently dead). To
--   preserve exact current access we mirror construction.masters onto every
--   new resource. The dead construction.organization rows are intentionally
--   NOT used and NOT deleted (Phase 5 cleanup removes umbrellas).
--
-- Only view/create/edit/delete are enforced by the routes (verified: no
-- masters route calls import/export/approve). import/export are mirrored onto
-- construction.master_item only, to match the Phase-1 tree + Phase-2 seed.
--
-- Tables (physical names): app_quikinfra."RolePermission",
--                          app_quikinfra."UserPermissionExtra".
-- Requires gen_random_uuid() (built into PostgreSQL 13+; otherwise run
--   CREATE EXTENSION IF NOT EXISTS pgcrypto; first).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) PRE-FLIGHT (optional) — how many source rows will fan out?
-- ---------------------------------------------------------------------------
-- SELECT resource, action, count(*)
--   FROM app_quikinfra."RolePermission"
--  WHERE resource = 'construction.masters'
--  GROUP BY resource, action ORDER BY action;
-- SELECT resource, action, revoke, count(*)
--   FROM app_quikinfra."UserPermissionExtra"
--  WHERE resource = 'construction.masters'
--  GROUP BY resource, action, revoke ORDER BY action, revoke;

BEGIN;

-- ===========================================================================
-- PART A — Role grants (app_quikinfra."RolePermission")
--   Applies to ALL roles (system + custom). The 4 system roles are also
--   backfilled by seedDefaultRoles on next seed; this makes it immediate and
--   is the ONLY path that covers admin-created custom roles.
-- ===========================================================================

-- A1) core actions (view/create/edit/delete) → all 18 new resources
WITH page_targets(new_resource) AS (VALUES
  ('construction.master_item'),
  ('construction.master_item_group'),
  ('construction.master_vendor'),
  ('construction.master_contractor'),
  ('construction.master_customer'),
  ('construction.master_location'),
  ('construction.master_machinery'),
  ('construction.master_asset'),
  ('construction.master_cost_center'),
  ('construction.master_labour'),
  ('construction.master_workman'),
  ('construction.org_company'),
  ('construction.org_department'),
  ('construction.org_gst'),
  ('construction.org_tds'),
  ('construction.org_uom'),
  ('construction.org_work_category'),
  ('construction.org_terms')
)
INSERT INTO app_quikinfra."RolePermission" (id, "roleId", resource, action)
SELECT gen_random_uuid()::text, rp."roleId", t.new_resource, rp.action
FROM app_quikinfra."RolePermission" rp
CROSS JOIN page_targets t
WHERE rp.resource = 'construction.masters'
  AND rp.action IN ('view', 'create', 'edit', 'delete')
ON CONFLICT ("roleId", resource, action) DO NOTHING;

-- A2) import/export → construction.master_item only
INSERT INTO app_quikinfra."RolePermission" (id, "roleId", resource, action)
SELECT gen_random_uuid()::text, rp."roleId", 'construction.master_item', rp.action
FROM app_quikinfra."RolePermission" rp
WHERE rp.resource = 'construction.masters'
  AND rp.action IN ('import', 'export')
ON CONFLICT ("roleId", resource, action) DO NOTHING;

-- ===========================================================================
-- PART B — Per-user overrides (app_quikinfra."UserPermissionExtra")
--   Preserves BOTH additive grants (revoke=false) and deny overrides
--   (revoke=true) at the per-page level, with the same revoke flag.
-- ===========================================================================

-- B1) core actions → all 18 new resources (carry over revoke + grantedBy)
WITH page_targets(new_resource) AS (VALUES
  ('construction.master_item'),
  ('construction.master_item_group'),
  ('construction.master_vendor'),
  ('construction.master_contractor'),
  ('construction.master_customer'),
  ('construction.master_location'),
  ('construction.master_machinery'),
  ('construction.master_asset'),
  ('construction.master_cost_center'),
  ('construction.master_labour'),
  ('construction.master_workman'),
  ('construction.org_company'),
  ('construction.org_department'),
  ('construction.org_gst'),
  ('construction.org_tds'),
  ('construction.org_uom'),
  ('construction.org_work_category'),
  ('construction.org_terms')
)
INSERT INTO app_quikinfra."UserPermissionExtra"
  (id, "orgId", "userId", resource, action, revoke, "grantedBy", "createdAt")
SELECT gen_random_uuid()::text, e."orgId", e."userId", t.new_resource,
       e.action, e.revoke, e."grantedBy", now()
FROM app_quikinfra."UserPermissionExtra" e
CROSS JOIN page_targets t
WHERE e.resource = 'construction.masters'
  AND e.action IN ('view', 'create', 'edit', 'delete')
ON CONFLICT ("orgId", "userId", resource, action) DO NOTHING;

-- B2) import/export → construction.master_item only
INSERT INTO app_quikinfra."UserPermissionExtra"
  (id, "orgId", "userId", resource, action, revoke, "grantedBy", "createdAt")
SELECT gen_random_uuid()::text, e."orgId", e."userId", 'construction.master_item',
       e.action, e.revoke, e."grantedBy", now()
FROM app_quikinfra."UserPermissionExtra" e
WHERE e.resource = 'construction.masters'
  AND e.action IN ('import', 'export')
ON CONFLICT ("orgId", "userId", resource, action) DO NOTHING;

-- Inspect within the transaction before committing (optional):
-- SELECT resource, count(*) FROM app_quikinfra."RolePermission"
--   WHERE resource ~ '^construction\.(master_|org_)' GROUP BY resource ORDER BY resource;
-- SELECT resource, revoke, count(*) FROM app_quikinfra."UserPermissionExtra"
--   WHERE resource ~ '^construction\.(master_|org_)' GROUP BY resource, revoke ORDER BY resource;

COMMIT;

-- ============================================================================
-- POST-CHECK (run after COMMIT)
-- ============================================================================
-- Expect one master_* / org_* row per source construction.masters row, per role/user.
-- SELECT resource, action, count(*) FROM app_quikinfra."RolePermission"
--   WHERE resource ~ '^construction\.(master_|org_)' GROUP BY resource, action ORDER BY 1,2;
-- SELECT resource, action, revoke, count(*) FROM app_quikinfra."UserPermissionExtra"
--   WHERE resource ~ '^construction\.(master_|org_)' GROUP BY resource, action, revoke ORDER BY 1,2,3;

-- ============================================================================
-- ROLLBACK (only if you need to undo — removes ONLY the new per-page rows;
-- the underscore in the regex is literal, so `construction.masters` is NOT hit)
-- ============================================================================
-- BEGIN;
-- DELETE FROM app_quikinfra."RolePermission"      WHERE resource ~ '^construction\.(master_|org_)';
-- DELETE FROM app_quikinfra."UserPermissionExtra" WHERE resource ~ '^construction\.(master_|org_)';
-- COMMIT;
