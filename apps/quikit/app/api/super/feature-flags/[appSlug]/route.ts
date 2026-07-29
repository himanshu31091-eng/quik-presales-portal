import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { getAppConfig, computeDisabledModules } from "@quikit/shared/moduleRegistry";

/**
 * GET /api/super/feature-flags/[appSlug]?orgId=X
 *
 * Returns the set of disabled moduleKeys for the given (tenant, app). The
 * registry is static + client-safe so the caller can merge this result with
 * the module tree on the client. Also returns the registry for convenience
 * — saves the client from re-importing it when rendering the tree.
 *
 * Response: { success: true, data: { app, disabledKeys: string[] } }
 */
export const GET = withSuperAdminAuth<{ appSlug: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const { appSlug } = params;
    const config = getAppConfig(appSlug);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Unknown app" },
        { status: 404 },
      );
    }

    const orgId = request.nextUrl.searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "orgId query param required" },
        { status: 400 },
      );
    }

    const app = await db.app.findUnique({
      where: { slug: appSlug },
      select: { id: true },
    });
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not registered in database" },
        { status: 404 },
      );
    }

    // Fetch ALL rows (not just enabled:false) so `computeDisabledModules` can
    // apply the registry's default-off modules and let an explicit enabled:true
    // row override them — keeping this view identical to the runtime gate.
    const rows = await db.appModuleFlag.findMany({
      where: { orgId, appId: app.id },
      select: { moduleKey: true, enabled: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        appSlug,
        orgId,
        disabledKeys: Array.from(computeDisabledModules(appSlug, rows)),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
