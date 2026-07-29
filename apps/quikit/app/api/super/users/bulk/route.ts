import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

/**
 * POST /api/super/users/bulk — Bulk actions on users (super admin only)
 * Body: { action: "grant_super_admin" | "revoke_super_admin", ids: string[] }
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

    if (!["grant_super_admin", "revoke_super_admin"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "action must be 'grant_super_admin' or 'revoke_super_admin'" },
        { status: 400 },
      );
    }

    const isSuperAdmin = action === "grant_super_admin";

    const result = await db.user.updateMany({
      where: { id: { in: ids } },
      data: { isSuperAdmin },
    });

    // Fire-and-forget audit logging for each id
    for (const id of ids) {
      logAudit({
        action: "toggle_super_admin",
        entityType: "user",
        entityId: id,
        actorId: auth.userId,
        newValues: JSON.stringify({ isSuperAdmin }),
      });
    }

    const notUpdated = ids.length - result.count;
    return NextResponse.json({
      success: true,
      message: `${result.count} user(s) updated`,
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
