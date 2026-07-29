/**
 * QuikIT super-admin wrapper that combines requireSuperAdmin + API-call logging.
 *
 * Covers every /api/super/* route. Logs to ApiCall with appSlug="quikit".
 * orgId in the log is always null for super-admin calls (they operate
 * across tenants, not from within one), but userId is populated.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";
import { logApiCall } from "@quikit/shared/apiLogging";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

export interface SuperAdminAuthContext {
  userId: string;
}

type Handler<Params> = (
  auth: SuperAdminAuthContext,
  req: NextRequest,
  ctx: { params: Params },
) => Promise<NextResponse> | NextResponse;

// Per-super-admin mutation rate limit. Legitimate support/ops use is very
// unlikely to exceed 60 mutations/minute — bulk operations should go via
// dedicated bulk endpoints that have their own caps. Fail-OPEN here so a
// Redis outage doesn't lock super admins out entirely (we still have audit
// trail coverage and the write path is small).
const SUPER_MUTATION_LIMIT = 60;
const SUPER_MUTATION_WINDOW_MS = 60 * 1000;
const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function withSuperAdminAuth<Params = Record<string, never>>(handler: Handler<Params>) {
  return async (req: NextRequest, ctx?: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let userIdForLog: string | null = null;
    let response: NextResponse;

    try {
      const auth = await requireSuperAdmin();
      if ("error" in auth) {
        response = auth.error;
      } else {
        userIdForLog = auth.userId;

        // Apply per-super-admin rate limit to mutation methods only. Reads
        // (GET) are unthrottled at this layer — the analytics/audit endpoints
        // have their own caching and cheap pagination.
        if (MUTATION_METHODS.has(req.method)) {
          const rl = await rateLimitAsync({
            routeKey: "super:mutation",
            clientKey: auth.userId,
            limit: SUPER_MUTATION_LIMIT,
            windowMs: SUPER_MUTATION_WINDOW_MS,
            failClosed: false,
          });
          if (!rl.ok) {
            response = NextResponse.json(
              {
                success: false,
                error: `Super-admin mutation rate limit exceeded (${SUPER_MUTATION_LIMIT}/min). Retry in ${rl.retryAfterSeconds}s.`,
              },
              {
                status: 429,
                headers: { "retry-after": String(rl.retryAfterSeconds) },
              },
            );
          } else {
            response = await handler({ userId: auth.userId }, req, ctx ?? ({ params: {} as Params }));
          }
        } else {
          response = await handler({ userId: auth.userId }, req, ctx ?? ({ params: {} as Params }));
        }
      }
    } catch (err) {
      response = NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Operation failed" },
        { status: 500 },
      );
    }

    void logApiCall({
      orgId: null,
      userId: userIdForLog,
      appSlug: "quikit",
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
