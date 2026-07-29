/**
 * Per-app role assignment helpers — thin wrapper around the shared
 * `@quikit/auth/assign-app-roles` so admin / quikit / auth all share
 * one implementation.
 */
import { db } from "@/lib/db";
import { assignAppRoles } from "@quikit/auth/assign-app-roles";

/** Stub kept for callers that still reference it. */
export async function ensureSystemRoles(
  _orgId: string,
  _appId: string,
): Promise<void> {
  // No-op: default Admin AppRole rows are seeded centrally via
  // scripts/seed-default-admin-roles.mjs and on org creation.
}

/** Stub kept for callers that still reference it. */
export async function assignDefaultRolesForAccess(
  _orgId: string,
  _assignments: { userId: string; appId: string }[],
): Promise<void> {
  // No-op: callers should pass an explicit roleName via assignNamedRolesForAccess.
}

/**
 * Resolves the named AppRole inside each app's `app_<slug>.AppRole`
 * table and inserts UserAppRole rows. Apps without RBAC v2 tables
 * are silently skipped (so calling this is safe for every invite).
 */
export async function assignNamedRolesForAccess(
  orgId: string,
  assignments: { userId: string; appId: string; roleName: string }[],
): Promise<void> {
  return assignAppRoles(db, orgId, assignments);
}
