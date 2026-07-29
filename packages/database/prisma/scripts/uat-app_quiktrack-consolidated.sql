-- ============================================================================
-- CONSOLIDATED MIGRATION — app_quiktrack schema
--
-- Every database change applied to the app_quiktrack schema in the recent
-- QuikTrack batch, combined into one idempotent script for running on UAT
-- (and any other environment that is behind).
--
-- Source migrations rolled up here (in execution order):
--   1. 20260619120000_quiktrack_functional_template   QtProject.templateKey, backlogName
--   2. 20260624120000_quiktrack_project_tab_config     QtProject.tabConfig
--   3. 20260622120000_quiktrack_doc_status             QtDoc.status (+ index)
--   4. 20260622130000_quiktrack_view_pref_filters      QtUserViewPref.filters
--   5. 20260622140000_quiktrack_doc_shares             QtDocShare table (+ indexes)
--   6. 20260622150000_quiktrack_doc_share_token        QtDocShare.token (+ unique index)
--   7. scripts/migrate-merge-project-roles             merge 5 legacy project roles -> 3
--
-- SAFETY
--   * Every DDL step is idempotent (IF NOT EXISTS / ON CONFLICT) — safe to re-run.
--   * Steps 1-6 are purely ADDITIVE (no drops, no data loss).
--   * Step 7 DELETES the 4 legacy project roles (Project Admin/PM/Developer/QA)
--     after remapping their user assignments. It is a NO-OP if those roles are
--     already gone. This step is NOT reversible once committed — snapshot UAT
--     first if you are unsure.
--   * Wrapped in a single transaction: it all commits or none of it does.
--
-- All object names are fully qualified to app_quiktrack; search_path is also
-- pinned as a second guard. After running, regenerate the Prisma client on the
-- target so the application picks up the new columns (`prisma generate`).
-- ============================================================================

SET search_path TO app_quiktrack;

BEGIN;

-- ─────────────────────────────────────────────────────────── 1. functional template
-- QtProject: templateKey ("scrum" | "functional"), backlogName (functional only).
ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "templateKey" text NOT NULL DEFAULT 'scrum';
ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "backlogName" text;

-- ─────────────────────────────────────────────────────────── 2. project tab config
-- QtProject: per-project tab customization. Ordered JSON array of enabled tab
-- paths; NULL = show all tabs (default).
ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "tabConfig" JSONB;

-- ─────────────────────────────────────────────────────────── 3. doc status
-- QtDoc.status: "draft" (author-only) | "published" (all project members).
-- Created DEFAULT 'published' so pre-existing docs stay visible, then the
-- default flips to 'draft' so NEW docs start private. No backfill UPDATE, so
-- re-running never reverts a doc a user intentionally set to draft.
ALTER TABLE app_quiktrack."QtDoc"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'published';
ALTER TABLE app_quiktrack."QtDoc"
  ALTER COLUMN "status" SET DEFAULT 'draft';
CREATE INDEX IF NOT EXISTS "QtDoc_projectId_status_idx"
  ON app_quiktrack."QtDoc" ("projectId", "status");

-- ─────────────────────────────────────────────────────────── 4. view-pref filters
-- QtUserViewPref.filters: auto-persisted sticky filter state per
-- (userId, projectId, viewKey).
ALTER TABLE app_quiktrack."QtUserViewPref"
  ADD COLUMN IF NOT EXISTS "filters" JSONB;

-- ─────────────────────────────────────────────────────────── 5. doc shares
-- Per-user document sharing. One row grants a user viewer/editor access to a
-- single QtDoc. Doc creator is the implicit Owner (not stored). `email` is
-- reserved for future external invites.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtDocShare" (
  "id"        text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "docId"     text NOT NULL,
  "userId"    text,
  "email"     text,
  "role"      text NOT NULL,
  "createdBy" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
-- One share per (doc, user) and per (doc, email). NULLs are distinct in
-- Postgres, so email-only rows don't collide on the userId index (and vice versa).
CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_docId_userId_key"
  ON app_quiktrack."QtDocShare" ("docId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_docId_email_key"
  ON app_quiktrack."QtDocShare" ("docId", "email");
CREATE INDEX IF NOT EXISTS "QtDocShare_docId_idx"
  ON app_quiktrack."QtDocShare" ("docId");
CREATE INDEX IF NOT EXISTS "QtDocShare_userId_idx"
  ON app_quiktrack."QtDocShare" ("userId");

-- ─────────────────────────────────────────────────────────── 6. doc share token
-- QtDocShare.token: per-recipient public token for EXTERNAL share invites
-- (view-only /share/<token>, no login). NULL for internal (userId) shares.
-- Depends on QtDocShare existing (step 5 above).
ALTER TABLE app_quiktrack."QtDocShare"
  ADD COLUMN IF NOT EXISTS "token" text;
CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_token_key"
  ON app_quiktrack."QtDocShare" ("token");

-- ─────────────────────────────────────────────────── 7. merge legacy project roles
-- Merge the legacy 5 starter project roles into 3:
--   Project Admin + PM -> Space Admin
--   Developer     + QA -> Contributor
--   Viewer             -> unchanged
-- For every non-deleted project: ensure the 3 target roles exist (copying grants
-- from the FIRST available source only — Project Admin before PM, Developer
-- before QA), remap QtProjectUserRole assignments, then delete the 4 legacy
-- roles (their permission / field-permission / nav rows cascade). Custom/renamed
-- roles are left untouched. NO-OP if the merge has already run.
DO $$
DECLARE
  proj            RECORD;
  v_space_id      text;
  v_contrib_id    text;
  v_viewer_id     text;
  v_src_id        text;
BEGIN
  FOR proj IN
    SELECT id, "orgId" FROM app_quiktrack."QtProject" WHERE "isDeleted" = false
  LOOP
    ------------------------------------------------------------------ Space Admin
    SELECT id INTO v_space_id FROM app_quiktrack."QtProjectRole"
      WHERE "projectId" = proj.id AND name = 'Space Admin' LIMIT 1;

    IF v_space_id IS NULL THEN
      v_space_id := gen_random_uuid()::text;
      INSERT INTO app_quiktrack."QtProjectRole"
        (id, "orgId", "projectId", name, "isDefault", "createdAt", "updatedAt")
      VALUES
        (v_space_id, proj."orgId", proj.id, 'Space Admin', false, now(), now());

      -- source: Project Admin first, else PM
      SELECT id INTO v_src_id FROM app_quiktrack."QtProjectRole"
        WHERE "projectId" = proj.id AND name = 'Project Admin' LIMIT 1;
      IF v_src_id IS NULL THEN
        SELECT id INTO v_src_id FROM app_quiktrack."QtProjectRole"
          WHERE "projectId" = proj.id AND name = 'PM' LIMIT 1;
      END IF;

      IF v_src_id IS NOT NULL THEN
        INSERT INTO app_quiktrack."QtProjectRolePermission" (id, "projectRoleId", resource, action)
          SELECT gen_random_uuid()::text, v_space_id, resource, action
          FROM app_quiktrack."QtProjectRolePermission" WHERE "projectRoleId" = v_src_id
          ON CONFLICT ("projectRoleId", resource, action) DO NOTHING;
        INSERT INTO app_quiktrack."ProjectRoleFieldPermission" (id, "projectRoleId", entity, field, level)
          SELECT gen_random_uuid()::text, v_space_id, entity, field, level
          FROM app_quiktrack."ProjectRoleFieldPermission" WHERE "projectRoleId" = v_src_id
          ON CONFLICT ("projectRoleId", entity, field) DO NOTHING;
      END IF;
    END IF;

    ------------------------------------------------------------------ Contributor
    SELECT id INTO v_contrib_id FROM app_quiktrack."QtProjectRole"
      WHERE "projectId" = proj.id AND name = 'Contributor' LIMIT 1;

    IF v_contrib_id IS NULL THEN
      v_contrib_id := gen_random_uuid()::text;
      INSERT INTO app_quiktrack."QtProjectRole"
        (id, "orgId", "projectId", name, "isDefault", "createdAt", "updatedAt")
      VALUES
        (v_contrib_id, proj."orgId", proj.id, 'Contributor', true, now(), now());

      -- source: Developer first, else QA
      SELECT id INTO v_src_id FROM app_quiktrack."QtProjectRole"
        WHERE "projectId" = proj.id AND name = 'Developer' LIMIT 1;
      IF v_src_id IS NULL THEN
        SELECT id INTO v_src_id FROM app_quiktrack."QtProjectRole"
          WHERE "projectId" = proj.id AND name = 'QA' LIMIT 1;
      END IF;

      IF v_src_id IS NOT NULL THEN
        INSERT INTO app_quiktrack."QtProjectRolePermission" (id, "projectRoleId", resource, action)
          SELECT gen_random_uuid()::text, v_contrib_id, resource, action
          FROM app_quiktrack."QtProjectRolePermission" WHERE "projectRoleId" = v_src_id
          ON CONFLICT ("projectRoleId", resource, action) DO NOTHING;
        INSERT INTO app_quiktrack."ProjectRoleFieldPermission" (id, "projectRoleId", entity, field, level)
          SELECT gen_random_uuid()::text, v_contrib_id, entity, field, level
          FROM app_quiktrack."ProjectRoleFieldPermission" WHERE "projectRoleId" = v_src_id
          ON CONFLICT ("projectRoleId", entity, field) DO NOTHING;
      END IF;
    END IF;

    ------------------------------------------------------------------ Viewer
    -- Source is "Viewer" itself; if it already exists nothing to do, if it does
    -- not exist it is created empty.
    SELECT id INTO v_viewer_id FROM app_quiktrack."QtProjectRole"
      WHERE "projectId" = proj.id AND name = 'Viewer' LIMIT 1;

    IF v_viewer_id IS NULL THEN
      v_viewer_id := gen_random_uuid()::text;
      INSERT INTO app_quiktrack."QtProjectRole"
        (id, "orgId", "projectId", name, "isDefault", "createdAt", "updatedAt")
      VALUES
        (v_viewer_id, proj."orgId", proj.id, 'Viewer', false, now(), now());
    END IF;

    ------------------------------------------------------ Remap user assignments
    -- Project Admin / PM -> Space Admin
    UPDATE app_quiktrack."QtProjectUserRole" ur
      SET "projectRoleId" = v_space_id
      WHERE ur."projectId" = proj.id
        AND ur."projectRoleId" IN (
          SELECT id FROM app_quiktrack."QtProjectRole"
          WHERE "projectId" = proj.id AND name IN ('Project Admin', 'PM')
        );

    -- Developer / QA -> Contributor
    UPDATE app_quiktrack."QtProjectUserRole" ur
      SET "projectRoleId" = v_contrib_id
      WHERE ur."projectId" = proj.id
        AND ur."projectRoleId" IN (
          SELECT id FROM app_quiktrack."QtProjectRole"
          WHERE "projectId" = proj.id AND name IN ('Developer', 'QA')
        );

    ------------------------------------------------------ Delete the legacy roles
    -- Permission / field-permission / navigation rows cascade via their FKs.
    DELETE FROM app_quiktrack."QtProjectRole"
      WHERE "projectId" = proj.id
        AND name IN ('Project Admin', 'PM', 'Developer', 'QA');
  END LOOP;
END $$;

COMMIT;

-- ── Post-checks (optional; run after COMMIT) ────────────────────────────────
-- New columns present:
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema = 'app_quiktrack'
--     AND ((table_name='QtProject'      AND column_name IN ('templateKey','backlogName','tabConfig'))
--      OR  (table_name='QtDoc'          AND column_name='status')
--      OR  (table_name='QtUserViewPref' AND column_name='filters')
--      OR  (table_name='QtDocShare'     AND column_name='token'))
--   ORDER BY table_name, column_name;
--
-- Role merge complete (both should return 0):
--   SELECT count(*) FROM app_quiktrack."QtProjectRole"
--   WHERE name IN ('Project Admin','PM','Developer','QA');
--   SELECT count(*) FROM app_quiktrack."QtProjectUserRole" ur
--   JOIN app_quiktrack."QtProjectRole" r ON r.id = ur."projectRoleId"
--   WHERE r.name IN ('Project Admin','PM','Developer','QA');
