/**
 * DEFERRED — depends on UserAppRole + AppRolePermission tables not yet
 * in the shared schema. See apps/new-admin/MIGRATION_NOTES.md.
 *
 * Until the schema migrates, both functions return empty / false.
 * Callers shouldn't crash; they just won't get any per-app permissions.
 */

export async function buildUserPermissions(
  _orgId: string,
  _userId: string,
  _appId: string,
): Promise<Set<string>> {
  return new Set();
}

export async function checkPermission(
  _orgId: string,
  _userId: string,
  _appId: string,
  _resource: string,
  _action: string,
): Promise<boolean> {
  return false;
}
