import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * Lists apps provisioned for the current org.
 *
 * Visibility rule must match apps/quikit/app/api/apps/launcher/route.ts:
 *
 *   OrgAppAccess uses **sparse storage with DEFAULT-OFF** semantics:
 *     - No row              → app is hidden (default off)
 *     - Row enabled = true  → app explicitly granted by super-admin
 *     - Row enabled = false → treated same as no row
 *
 * We also exclude the Admin Portal itself (`requiresOrgAdmin = true`) because
 * granting "access to Admin Portal" to a member is controlled by their
 * membership role (org_admin), not by the per-app access matrix.
 */
export const GET = withAdminAuth(async ({ orgId }) => {
  const [allApps, accessRows] = await Promise.all([
    db.app.findMany({
      // Exclude `quikit` (the launcher IS the platform, not a tenant app)
      // and admin-tier apps (gated by OrgMember.role, not the access matrix).
      where: {
        status: { not: "disabled" },
        requiresOrgAdmin: false,
        slug: { not: "quikit" },
      },
      select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true, description: true },
      orderBy: { name: "asc" },
    }),
    db.orgAppAccess.findMany({
      where: { orgId, enabled: true },
      select: { appId: true },
    }),
  ]);

  const enabledAppIds = new Set(accessRows.map((r) => r.appId));
  const provisioned = allApps.filter((app) => enabledAppIds.has(app.id));

  return NextResponse.json({ success: true, data: provisioned });
});
