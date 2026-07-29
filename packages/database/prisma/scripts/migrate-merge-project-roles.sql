-- ============================================================================
-- ONE-SHOT DATA MIGRATION — merge legacy 5 starter project roles into 3.
--   Project Admin + PM -> Space Admin
--   Developer    + QA -> Contributor
--   Viewer            -> unchanged
-- SQL port of apps/quiktrack/scripts/migrate-merge-project-roles.mjs.
--
-- Behaviour matches the .mjs exactly:
--   * Runs over every non-deleted project.
--   * Ensures "Space Admin", "Contributor", "Viewer" exist per project; when a
--     target is created it copies grants from the FIRST available source only
--     (Project Admin before PM; Developer before QA). It does NOT union both.
--   * Remaps QtProjectUserRole assignments from legacy -> target.
--   * Deletes the 4 legacy roles (their permission/nav rows cascade).
--   * Custom/renamed roles are left untouched.
--
-- NOT reversible once committed (deletes roles). Snapshot Neon first.
-- Physical table names: QtProjectRoleFieldPermission is mapped to
-- "ProjectRoleFieldPermission"; the others keep their model names.
-- ============================================================================

-- ── PREVIEW (run these first; equivalent to the .mjs dry-run) ────────────────
-- 1) assignments that will be remapped:
--   SELECT count(*) FROM app_quiktrack."QtProjectUserRole" ur
--   JOIN app_quiktrack."QtProjectRole" r ON r.id = ur."projectRoleId"
--   WHERE r.name IN ('Project Admin','PM','Developer','QA');
--
-- 2) legacy roles that will be deleted:
--   SELECT count(*) FROM app_quiktrack."QtProjectRole"
--   WHERE name IN ('Project Admin','PM','Developer','QA');
--
-- 3) custom/renamed roles left untouched (review before committing):
--   SELECT p.name AS project, r.name AS role
--   FROM app_quiktrack."QtProjectRole" r
--   JOIN app_quiktrack."QtProject" p ON p.id = r."projectId"
--   WHERE r.name NOT IN ('Space Admin','Contributor','Viewer',
--                        'Project Admin','PM','Developer','QA')
--   ORDER BY p.name, r.name;
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

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
    -- not exist it is created empty (matches the .mjs).
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

-- Post-check (should both return 0):
--   SELECT count(*) FROM app_quiktrack."QtProjectRole"
--   WHERE name IN ('Project Admin','PM','Developer','QA');
--   SELECT count(*) FROM app_quiktrack."QtProjectUserRole" ur
--   JOIN app_quiktrack."QtProjectRole" r ON r.id = ur."projectRoleId"
--   WHERE r.name IN ('Project Admin','PM','Developer','QA');

COMMIT;
