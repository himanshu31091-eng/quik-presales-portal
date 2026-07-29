import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * Launcher data for the admin-next portal. Lists provisioned apps via the
 * shared `OrgAppAccess` table (sparse — apps without a row are considered
 * provisioned).
 */
export const GET = withAdminAuth(async ({ orgId, userId }) => {
  const [org, user, allApps, accessRows] = await Promise.all([
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, avatar: true },
    }),
    db.app.findMany({
      where: { status: "active" },
      select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true },
      orderBy: { name: "asc" },
    }),
    db.orgAppAccess.findMany({
      where: { orgId },
      select: { appId: true, enabled: true },
    }),
  ]);

  const enabledByAppId = new Map(accessRows.map((r) => [r.appId, r.enabled]));
  const apps = allApps
    .filter((app) => enabledByAppId.get(app.id) !== false)
    .map((app) => ({ ...app, baseUrl: resolveBaseUrl(app.slug, app.baseUrl) }));

  return NextResponse.json({
    success: true,
    data: {
      orgName: org?.name ?? "",
      orgLogoUrl: org?.logoUrl ?? null,
      user: {
        name: user ? `${user.firstName} ${user.lastName}`.trim() : "",
        email: user?.email ?? "",
      },
      apps,
    },
  });
});

// App.baseUrl in the DB holds PRODUCTION URLs, so resolve the launch target the
// same way the switcher does: per-app env override → DB baseUrl → localhost dev
// fallback. Without this, a local-dev admin clicking a tile is sent to prod.
const envBaseUrls: Record<string, string | undefined> = {
  quikit: process.env.QUIKIT_URL,
  auth: process.env.NEXT_PUBLIC_AUTH_URL,
  admin: process.env.ADMIN_URL,
  quikscale: process.env.QUIKSCALE_URL,
  quikasset: process.env.QUIKASSET_URL,
  quiktrack: process.env.QUIKTRACK_URL,
  quikvc: process.env.QUIKVC_URL,
  quikinfra: process.env.QUIKINFRA_URL,
  quiksocial: process.env.QUIKSOCIAL_URL,
  quikcrm: process.env.QUIKCRM_URL,
  quikhrms: process.env.QUIKHRMS_URL,
};
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
  quikhrms: "http://localhost:3009",
};
function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
  const fromEnv = envBaseUrls[slug];
  if (fromEnv) return fromEnv;
  if (dbBaseUrl) return dbBaseUrl;
  if (process.env.NODE_ENV !== "production" && devLocalhostFallbacks[slug]) {
    return devLocalhostFallbacks[slug];
  }
  return "";
}
