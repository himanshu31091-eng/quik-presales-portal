import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared/pagination";

/**
 * GET /api/super/audit — list audit log entries with filters (super admin only)
 */
export const GET = withSuperAdminAuth(async (_auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);
    const action = searchParams.get("action") || "";
    const entityType = searchParams.get("entityType") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate);
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginationToSkipTake(pagination),
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ success: true, ...buildPaginationResponse(logs, total, pagination) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
