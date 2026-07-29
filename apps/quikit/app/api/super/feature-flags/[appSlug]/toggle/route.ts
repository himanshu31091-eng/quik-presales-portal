import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { getAppConfig } from "@quikit/shared/moduleRegistry";
import { invalidate } from "@quikit/shared/redisCache";
import { invalidateDisabledModules } from "@quikit/auth/feature-gate";

/**
 * POST /api/super/feature-flags/[appSlug]/toggle
 * Body: { orgId: string, moduleKey: string, enabled: boolean }
 *
 * Sparse storage:
 *   - enabled: true  → DELETE the row (or no-op if not present).
 *   - enabled: false → UPSERT a row with enabled: false.
 *
 * Writes an AuditLog entry on every successful change.
 *
 * Response: { success: true, data: { orgId, moduleKey, enabled } }
 */

const bodySchema = z.object({
  orgId: z.string().min(1),
  moduleKey: z.string().min(1).max(200),
  enabled: z.boolean(),
});

export const POST = withSuperAdminAuth<{ appSlug: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const actorId = auth.userId;

    const { appSlug } = params;
    const config = getAppConfig(appSlug);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Unknown app" },
        { status: 404 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid body" },
        { status: 400 },
      );
    }
    const { orgId, moduleKey, enabled } = parsed.data;

    // Sanity: the moduleKey must exist in the registry for this app. We
    // still write/delete even if not — future registry edits would orphan
    // otherwise — but warn so operators see it in logs.
    const moduleDef = config.modules.find((m) => m.key === moduleKey);
    if (!moduleDef) {
      console.warn(
        `[feature-flags] moduleKey '${moduleKey}' is not in the ${appSlug} registry`,
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

    // Verify the target org exists (useful 404 rather than FK violation).
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    // Storage convention depends on the module's registry default:
    //   - default-ON module:  a row exists only to DISABLE it (enabled:false);
    //     absence = enabled. So enable → delete row, disable → upsert false.
    //   - default-OFF module (`defaultDisabled`, e.g. Cash/Survey): a row exists
    //     only to ENABLE it (enabled:true); absence = disabled. So enable →
    //     upsert true, disable → delete row (back to the default-off state).
    const defaultOff = moduleDef?.defaultDisabled === true;
    const shouldPersistRow = defaultOff ? enabled : !enabled;

    if (shouldPersistRow) {
      await db.appModuleFlag.upsert({
        where: {
          orgId_appId_moduleKey: { orgId, appId: app.id, moduleKey },
        },
        create: {
          orgId,
          appId: app.id,
          moduleKey,
          enabled,
          updatedBy: actorId,
        },
        update: {
          enabled,
          updatedBy: actorId,
        },
      });
    } else {
      await db.appModuleFlag.deleteMany({
        where: { orgId, appId: app.id, moduleKey },
      });
    }

    logAudit({
      action: enabled ? "feature_flag_enabled" : "feature_flag_disabled",
      entityType: "AppModuleFlag",
      entityId: `${appSlug}/${moduleKey}`,
      actorId,
      orgId,
      newValues: JSON.stringify({ appSlug, moduleKey, enabled, orgName: org.name }),
    });

    // Invalidate BOTH cache layers so the next /api/feature-flags/me fetch
    // from the target app returns fresh state:
    //   1. The gate's own disabled-set cache (in-memory LRU + Redis, with
    //      pub/sub so peer app processes drop their copies too). Skipping this
    //      means the `me` recompute below still reads up-to-30s-stale data.
    //   2. The `me` endpoint's 5-min Redis response wrapper.
    // Without both, a toggle appears "stuck" in the target app's sidebar.
    await invalidateDisabledModules(orgId, appSlug);
    await invalidate(`ff:me:${appSlug}:${orgId}`);

    return NextResponse.json({
      success: true,
      data: { orgId, moduleKey, enabled },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
