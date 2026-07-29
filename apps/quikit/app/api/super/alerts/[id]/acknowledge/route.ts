/**
 * SA-C.3 — Acknowledge an alert (keeps it visible but marks the decision).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";

export const POST = withSuperAdminAuth<{ id: string }>(async ({ userId }, _req, { params }) => {
  try {
    const updated = await db.platformAlert.update({
      where: { id: params.id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to acknowledge";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
