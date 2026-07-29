import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized } from "@/lib/api/responses";
import { ACTIONS, PERMISSION_TREE, SEEDED_ROLE_NAMES } from "@/lib/api/permissionsRegistry";

const withSettingsAuth = withOrgAuthForModule("settings");

/**
 * GET /api/roles/permissions — the permission tree the matrix UI renders.
 *
 * Static, but served behind auth so the app's resource vocabulary isn't a
 * public endpoint.
 */
export const GET = withSettingsAuth(async ({ orgId, userId }) => {
  const denied = await requirePermission(userId, orgId, "settings", "manage");
  if (denied) return denied;

  return okSerialized({
    actions: ACTIONS,
    modules: PERMISSION_TREE,
    // Seeded role names — the UI marks these non-deletable.
    seededRoles: SEEDED_ROLE_NAMES,
  });
});
