import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

/**
 * POST /api/super/apps/bulk — Bulk actions on apps (super admin only)
 * Body: { action: "disable" | "activate", ids: string[] }
 */
export const POST = withSuperAdminAuth(async (auth, request: NextRequest) => {
  try {
    const body = await request.json();
    const { action, ids } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "action and ids[] are required" },
        { status: 400 },
      );
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: "Maximum 100 items per bulk operation" },
        { status: 400 },
      );
    }

    if (!["disable", "activate"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "action must be 'disable' or 'activate'" },
        { status: 400 },
      );
    }

    const newStatus = action === "disable" ? "disabled" : "active";

    const result = await db.app.updateMany({
      where: { id: { in: ids } },
      data: { status: newStatus },
    });

    // Fire-and-forget audit logging for each id
    for (const id of ids) {
      logAudit({
        action,
        entityType: "app",
        entityId: id,
        actorId: auth.userId,
        newValues: JSON.stringify({ status: newStatus }),
      });
    }

    const notUpdated = ids.length - result.count;
    return NextResponse.json({
      success: true,
      message: `${result.count} app(s) updated`,
      data: {
        requested: ids.length,
        updated: result.count,
        ...(notUpdated > 0 ? { skipped: notUpdated } : {}),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
