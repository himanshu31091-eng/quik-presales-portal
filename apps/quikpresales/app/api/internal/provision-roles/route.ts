import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles — service-to-service only.
 *
 * Mirror of quiksupport / quiktrack / quikscale. Seeds QuikPreSales' standard
 * RBAC rows (app_quikpresales.AppRole / RolePermission / UserAppRole) for an
 * org, then puts any `adminUserIds` on the admin role. Called by the launcher's
 * eager provisioning (apps/quikit/lib/provisionAppRoles.ts) when an org is
 * granted access to quikpresales.
 *
 * Without this route the app still works — roles seed lazily on the first
 * authenticated request — but org admins would land with no app role until
 * someone hits the app, so the launcher provisions ahead of time.
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret`. Fails closed when the
 * secret is unset.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let orgId: string | null = null;
  let adminUserIds: string[] = [];
  try {
    const body = (await req.json()) as { orgId?: unknown; adminUserIds?: unknown };
    if (typeof body.orgId === "string" && body.orgId.trim()) orgId = body.orgId.trim();
    if (Array.isArray(body.adminUserIds)) {
      adminUserIds = body.adminUserIds.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
    }
  } catch {
    // fall through to the 400 below
  }

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }

  try {
    const seeded = await seedAllDefaultRoles(orgId);
    if (!seeded) {
      return NextResponse.json(
        { success: false, error: "quikpresales is not registered in quikit.App yet" },
        { status: 503 },
      );
    }

    for (const userId of adminUserIds) {
      await ensureUserOnRole(userId, orgId, seeded.adminRoleId);
    }

    return NextResponse.json({
      success: true,
      adminRoleId: seeded.adminRoleId,
      defaultRoleId: seeded.defaultRoleId,
      assignedAdminUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
