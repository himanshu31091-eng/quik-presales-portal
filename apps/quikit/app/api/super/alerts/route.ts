/**
 * SA-C.3 — List open alerts (for the Analytics dashboard).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";

export const GET = withSuperAdminAuth(async () => {
  try {
    const open = await db.platformAlert.findMany({
      where: { resolvedAt: null },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 50,
    });
    return NextResponse.json({
      success: true,
      data: open.map((a) => ({
        ...a,
        firstSeenAt: a.firstSeenAt.toISOString(),
        lastSeenAt: a.lastSeenAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load alerts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
