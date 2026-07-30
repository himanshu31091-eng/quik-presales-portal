import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db as dbCentral } from "@quikit/database";
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from "@quikit/shared";
import { authOptions } from "@/lib/auth";

/**
 * This handler takes no request argument, so without this marker Next treats it
 * as statically analyzable and evaluates it during `next build` — which loads
 * `@quikit/database` and constructs PrismaClient. On a build machine with no
 * DATABASE_URL that throws
 * `PrismaClientConstructorValidationError: Invalid value undefined for
 * datasource "db"` and fails the whole build. It passed locally only because
 * .env.local supplied the variable.
 *
 * The result is per-user and per-org and must never be cached or prerendered
 * regardless, so forcing dynamic is correct on its own merits.
 */
export const dynamic = "force-dynamic";

/**
 * GET /api/apps/switcher
 *
 * Apps the current user can see in the in-app AppSwitcher (the grid dropdown
 * in the header). This MUST agree with the QuikIT launcher (`/apps`) and every
 * other app's switcher for the same user + active org, or the switcher and the
 * portal disagree about what someone can open. Reads the shared registry
 * directly — no cross-origin call needed.
 *
 * Visibility rule (identical to quikscale / quikinfra):
 *   1. The org must have OrgAppAccess.enabled = true for the app.
 *   2. If App.requiresOrgAdmin, the caller's membership role must be in
 *      ADMIN_TIER_ROLES (or they're a platform super admin).
 *   3. Org/super admins see every provisioned app; everyone else needs an
 *      explicit UserAppAccess row (that row is an override, not a blanket gate).
 *   4. `quikit` is excluded — it's the launcher, not a switch target.
 *
 * NOTE: consumer apps force `session.user.isSuperAdmin = false`, so the admin
 * path is driven by `membershipRole` via ADMIN_TIER_ROLES.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; isSuperAdmin?: boolean; orgId?: string; membershipRole?: string }
    | undefined;
  const userId = user?.id;
  if (!session?.user || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = user.isSuperAdmin === true;
  let orgId = user.orgId;
  let memberRole = user.membershipRole;

  // Fall back to the first active membership when orgId isn't on the session.
  if (!orgId) {
    const membership = await dbCentral.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
    memberRole = membership?.role ?? memberRole;
  }

  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  const allApps = await dbCentral.app.findMany({
    where: { status: { not: "disabled" }, slug: { notIn: ["quikit", ...HIDDEN_APP_SLUGS] } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      baseUrl: true,
      status: true,
      requiresOrgAdmin: true,
    },
    orderBy: { name: "asc" },
  });

  // Org entitlement is sparse and default-OFF: only an enabled row counts.
  const orgAllows = orgId
    ? await dbCentral.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));

  const userAccess = orgId
    ? await dbCentral.userAppAccess.findMany({ where: { userId, orgId }, select: { appId: true } })
    : [];
  const userAppIds = new Set(userAccess.map((u) => u.appId));

  /**
   * Env overrides let local dev (localhost ports) run against a Neon DB whose
   * App.baseUrl rows hold production URLs — without every "switch app" click
   * navigating to production.
   */
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    admin: process.env.ADMIN_URL,
    quikscale: process.env.QUIKSCALE_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
    quiksupport: process.env.QUIKSUPPORT_URL,
    quikhrms: process.env.QUIKHRMS_URL,
    quikasset: process.env.QUIKASSET_URL,
    quikchat: process.env.QUIKCHAT_URL,
    quiklms: process.env.QUIKLMS_URL,
    quikpresales: process.env.QUIKPRESALES_URL,
  };

  const isDev = process.env.NODE_ENV !== "production";
  const devLocalhostFallbacks: Record<string, string> = {
    quikit: "http://localhost:3000",
    auth: "http://localhost:3001",
    admin: "http://localhost:3002",
    quikscale: "http://localhost:3003",
    quiktrack: "http://localhost:3004",
    quikvc: "http://localhost:3005",
    quikinfra: "http://localhost:3006",
    quiksocial: "http://localhost:3007",
    quikcrm: "http://localhost:3008",
    quikhrms: "http://localhost:3009",
    quiksupport: "http://localhost:3010",
    quikchat: "http://localhost:3011",
    quikasset: "http://localhost:3012",
    quikfinance: "http://localhost:3013",
    quiklms: "http://localhost:3014",
    quikpresales: "http://localhost:3015",
  };

  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  const visibleApps = allApps.filter((app) => {
    if (!orgAllowedAppIds.has(app.id)) return false;
    if (app.requiresOrgAdmin && !memberIsAdmin) return false;
    if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(app.id)) return false;
    return true;
  });

  const data = visibleApps.map((app) => ({
    ...app,
    baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
    installed: true, // visibility implies installed under this rule
  }));

  // Surfaced so the switcher's "View all apps" link doesn't need
  // NEXT_PUBLIC_QUIKIT_URL baked in at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
