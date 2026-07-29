import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";
import { HIDDEN_APP_SLUGS } from "@quikit/shared";

/**
 * GET /api/apps/switcher
 *
 * Feeds the @quikit/ui <AppSwitcher /> grid in the admin header. The admin
 * portal previously shipped no switcher endpoint, so the component's default
 * fetch to /api/apps/switcher 404'd and the popover always showed
 * "No apps available". This mirrors apps/quikscale/app/api/apps/switcher and
 * the launcher (apps/quikit/app/api/apps/launcher) so the switcher, the
 * launcher, and the portal never disagree about what an org can see.
 *
 * Visibility rule:
 *   1. The org must have OrgAppAccess.enabled = true for the app (provisioning,
 *      sparse + default-off — no row means hidden).
 *   2. `quikit` is excluded — it's the launcher, not a switch target.
 *
 * The admin portal is admin-only (middleware `requireAdmin: true`, and
 * withAdminAuth re-checks), so the caller is always org-admin tier and gets
 * full-org visibility — there's no per-user UserAppAccess narrowing here.
 */
export const GET = withAdminAuth(async ({ orgId }) => {
  const [allApps, accessRows] = await Promise.all([
    db.app.findMany({
      where: { status: { not: "disabled" }, slug: { notIn: ["quikit", ...HIDDEN_APP_SLUGS] } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        baseUrl: true,
        status: true,
      },
      orderBy: { name: "asc" },
    }),
    db.orgAppAccess.findMany({
      where: { orgId, enabled: true },
      select: { appId: true },
    }),
  ]);

  const enabledAppIds = new Set(accessRows.map((r) => r.appId));

  // Env-override map: if the deployment supplies a per-app URL via env, use it
  // instead of the DB's stored baseUrl. Lets local dev (.env.local localhost
  // ports) run against a Neon DB whose App.baseUrl rows hold prod URLs without
  // sending every "switch app" click to production. Mirrors the launcher +
  // quikscale switcher endpoints.
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    quikasset: process.env.QUIKASSET_URL,
    admin: process.env.ADMIN_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
    quiksupport: process.env.QUIKSUPPORT_URL,
    quikhrms: process.env.QUIKHRMS_URL,
  };
  const isDev = process.env.NODE_ENV !== "production";
  const devLocalhostFallbacks: Record<string, string> = {
    quikit: "http://localhost:3000",
    auth: "http://localhost:3001",
    admin: "http://localhost:3002",
    quikscale: "http://localhost:3003",
    quikasset: "http://localhost:3012",
    quiktrack: "http://localhost:3004",
    quikvc: "http://localhost:3005",
    quikinfra: "http://localhost:3006",
    quiksocial: "http://localhost:3007",
    quikcrm: "http://localhost:3008",
    quiksupport: "http://localhost:3010",
    quikhrms: "http://localhost:3009",
  };
  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  const data = allApps
    .filter((app) => enabledAppIds.has(app.id))
    .map((app) => ({
      ...app,
      baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
      installed: true, // visibility implies installed under the provisioning rule
    }));

  // The IdP base URL lives in QUIKIT_URL (server-side, required for OAuth).
  // Include it so the switcher's "View all apps" link doesn't depend on
  // NEXT_PUBLIC_QUIKIT_URL being set at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      // Per-user response — never share. Browser serves from cache for 30s,
      // tolerates 60s of staleness while revalidating in background.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
});
