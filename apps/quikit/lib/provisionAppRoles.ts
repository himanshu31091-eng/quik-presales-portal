/**
 * Fire-and-forget bridge that asks each granted app to seed its own RBAC
 * tables (AppRole / RolePermission / UserAppRole) for a freshly-provisioned
 * org — and, when provided, assign one or more Org Admin users to the
 * seeded admin AppRole.
 *
 * Called from the two super-admin flows that hand an org access to an app:
 *   • POST /api/super/orgs              — create-org-with-admin
 *   • POST /api/super/org-app-access/:  — later grant/revoke toggles
 *
 * Why HTTP rather than a direct Prisma call from quikit: each app owns
 * its own schema (app_quikscale, app_quiktrack, …) and its own permission
 * registry. Calling the app's own /api/internal/provision-roles endpoint
 * keeps the "which permissions exist + how the admin role is shaped"
 * decision inside the app where it belongs.
 *
 * Each call is best-effort: a slow/unreachable target never blocks or
 * fails the grant. The app's own lazy seed (on first authenticated load)
 * remains the safety net.
 */

interface ProvisionableApp {
  slug: string;
  baseUrl: string | null;
}

/**
 * Per-app override env var name. Falls back to App.baseUrl when unset.
 * Add new apps here as they grow an /api/internal/provision-roles route.
 */
const APP_URL_OVERRIDE: Record<string, string> = {
  quikscale: "QUIKSCALE_URL",
  quiktrack: "QUIKTRACK_URL",
  quikinfra: "QUIKINFRA_URL",
  quiksocial: "QUIKSOCIAL_URL",
  quikcrm: "QUIKCRM_URL",
  quikasset: "QUIKASSET_URL",
  quiksupport: "QUIKSUPPORT_URL",
  quikchat: "QUIKCHAT_URL",
  quiklms: "QUIKLMS_URL",
  quikpresales: "QUIKPRESALES_URL",
};

/**
 * Resolve the base URL for `app`. Returns null when the slug isn't one we
 * know how to provision OR when no URL is configured.
 */
function resolveBaseUrl(app: ProvisionableApp): string | null {
  const envKey = APP_URL_OVERRIDE[app.slug];
  if (!envKey) return null;
  const fromEnv = process.env[envKey];
  const base = (fromEnv ?? app.baseUrl ?? "").replace(/\/+$/, "");
  return base.length > 0 ? base : null;
}

/**
 * Fire a single provision-roles POST. Resolves true on 2xx, false on any
 * other outcome (incl. network error). Never throws — callers should
 * treat the seed as advisory.
 */
export async function provisionAppRoles(
  app: ProvisionableApp,
  orgId: string,
  adminUserIds: string[] = [],
): Promise<boolean> {
  const base = resolveBaseUrl(app);
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!base || !internalSecret) return false;

  try {
    const res = await fetch(`${base}/api/internal/provision-roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ orgId, adminUserIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fan-out helper: call provisionAppRoles for every app in `apps`. Each
 * call is dispatched in parallel and the function resolves once they're
 * all settled. Failures are swallowed (logged in the per-call helper).
 */
export async function provisionAppRolesForOrg(
  apps: ProvisionableApp[],
  orgId: string,
  adminUserIds: string[] = [],
): Promise<void> {
  await Promise.allSettled(
    apps.map((app) => provisionAppRoles(app, orgId, adminUserIds)),
  );
}
