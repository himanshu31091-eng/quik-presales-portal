import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

/**
 * POST /api/super/orgs/bulk — Bulk actions on organizations (super admin only)
 * Body: { action: "suspend" | "activate", ids: string[] }
 */
export const POST = withSuperAdminAuth(async ({ userId }, request: NextRequest) => {
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

    if (!["suspend", "activate"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "action must be 'suspend' or 'activate'" },
        { status: 400 },
      );
    }

    const newStatus = action === "suspend" ? "suspended" : "active";

    const result = await db.org.updateMany({
      where: { id: { in: ids } },
      data: { status: newStatus },
    });

    // Fire-and-forget audit logging for each id
    for (const id of ids) {
      logAudit({
        action,
        entityType: "tenant",
        entityId: id,
        actorId: userId,
        orgId: id,
        newValues: JSON.stringify({ status: newStatus }),
      });
    }

    const notUpdated = ids.length - result.count;
    return NextResponse.json({
      success: true,
      message: `${result.count} organization(s) updated`,
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
