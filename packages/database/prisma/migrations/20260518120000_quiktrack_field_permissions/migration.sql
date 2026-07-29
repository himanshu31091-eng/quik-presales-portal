-- QuikTrack field-level RBAC (Layer 1) — adds QtRoleFieldPermission.
-- Captures the level at which a role can interact with each form field:
--   hidden / readonly / editable / required.
-- Absence of a row implies "editable" (the default in app code).

CREATE TABLE app_quiktrack."RoleFieldPermission" (
  id       TEXT PRIMARY KEY,
  "roleId" TEXT NOT NULL REFERENCES app_quiktrack."AppRole"(id) ON DELETE CASCADE,
  entity   TEXT NOT NULL,
  field    TEXT NOT NULL,
  level    TEXT NOT NULL
);

CREATE UNIQUE INDEX "RoleFieldPermission_role_entity_field_key"
  ON app_quiktrack."RoleFieldPermission"("roleId", entity, field);

CREATE INDEX "RoleFieldPermission_role_entity_idx"
  ON app_quiktrack."RoleFieldPermission"("roleId", entity);
