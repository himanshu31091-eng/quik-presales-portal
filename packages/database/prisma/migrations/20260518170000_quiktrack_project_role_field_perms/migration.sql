-- Layer 2 field-level RBAC — per-project-role field permission rows.
-- Mirrors app_quiktrack."RoleFieldPermission" but keyed on QtProjectRole.

CREATE TABLE app_quiktrack."ProjectRoleFieldPermission" (
  id              TEXT PRIMARY KEY,
  "projectRoleId" TEXT NOT NULL REFERENCES app_quiktrack."QtProjectRole"(id) ON DELETE CASCADE,
  entity          TEXT NOT NULL,
  field           TEXT NOT NULL,
  level           TEXT NOT NULL
);

CREATE UNIQUE INDEX "ProjectRoleFieldPermission_role_entity_field_key"
  ON app_quiktrack."ProjectRoleFieldPermission"("projectRoleId", entity, field);

CREATE INDEX "ProjectRoleFieldPermission_role_entity_idx"
  ON app_quiktrack."ProjectRoleFieldPermission"("projectRoleId", entity);
