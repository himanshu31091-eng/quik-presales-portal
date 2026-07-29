/**
 * admin API auth wrapper.
 *
 * Each route that uses this wrapper:
 *   - Short-circuits with 401/403 if the caller isn't an admin (uses shared
 *     @quikit/auth createRequireAdmin factory).
 *   - Logs a row in ApiCall after the response (fire-and-forget, via
 *     @quikit/shared/apiLogging — same row shape every other app writes).
 *   - Captures orgId + userId from the auth result so analytics can slice
 *     by tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { logApiCall } from "@quikit/shared/apiLogging";

export interface AdminAuthContext {
  userId: string;
  orgId: string;
}

type Handler<Params> = (
  auth: AdminAuthContext,
  req: NextRequest,
  ctx: { params: Params },
) => Promise<NextResponse> | NextResponse;

export function withAdminAuth<Params = Record<string, never>>(handler: Handler<Params>) {
  return async (req: NextRequest, ctx?: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;

    try {
      const auth = await requireAdmin();
      if ("error" in auth && auth.error) {
        response = auth.error;
      } else {
        orgIdForLog = auth.orgId;
        userIdForLog = auth.userId;
        response = await handler(
          { userId: auth.userId, orgId: auth.orgId },
          req,
          ctx ?? ({ params: {} as Params }),
        );
      }
    } catch (err) {
      response = NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Operation failed" },
        { status: 500 },
      );
    }

    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "admin",
      method: req.method,
      path: req.nextUrl.pathname,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });

    return response;
  };
}
