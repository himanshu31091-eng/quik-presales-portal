import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET /api/org/info
 *
 * The active org's identity (id, name, slug). Drives the org chip in the
 * header so multi-org members always know which tenant they're looking at.
 * Lightweight single-table read; no permission beyond the standard org guard.
 *
 * Mirrors apps/quikscale/app/api/org/info.
 */
export const GET = withOrgAuth(
  async ({ orgId }) => {
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });

    if (!org) {
      return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: org });
  },
  { fallbackErrorMessage: "Failed to fetch organization info" },
);
