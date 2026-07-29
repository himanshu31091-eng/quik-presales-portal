import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { logApiCall } from "@quikit/shared/apiLogging";

/**
 * Standard auth + tenant guard for every QuikPreSales API route that touches
 * the database.
 *
 * Forked from apps/quiktrack/lib/api/withOrgAuth.ts (the reference
 * implementation). Two traps this avoids:
 *   - `apps/_template/lib/api/withOrgAuth.ts` imports `@quikit/auth/withOrgAuth`,
 *     which is not in the package's exports map — the template version does
 *     not compile.
 *   - quikvc's copy passes the literal "quikscale" to gateModuleApi and
 *     logApiCall. The slug below must stay "quikpresales".
 *
 * Behavior:
 *   - no session            → 401
 *   - no active membership  → 403
 *   - module disabled       → 404 (via gateModuleApi, when `moduleKey` is set)
 *   - handler throws        → 500 with `toErrorMessage`
 *
 * Usage:
 *   export const GET = withOrgAuth(async ({ orgId }, req) => { ... });
 *   export const GET = withOrgAuth<{ id: string }>(
 *     async ({ orgId }, req, { params }) => { ... },
 *     { moduleKey: "engagements" },
 *   );
 */
export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithOrgAuthOptions {
  /** Error message used when the handler throws an unhandled exception. */
  fallbackErrorMessage?: string;
  /**
   * Feature-flag module gate. When set, the wrapper calls `gateModuleApi`
   * after the auth check — if the org has this module (or any ancestor)
   * disabled, the handler is skipped and a 404 is returned.
   */
  moduleKey?: string;
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: OrgAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithOrgAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;

    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        response = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      } else {
        userIdForLog = session.user.id;
        const orgId = await getOrgId(session.user.id);
        if (!orgId) {
          response = NextResponse.json(
            { success: false, error: "No active membership" },
            { status: 403 },
          );
        } else {
          orgIdForLog = orgId;
          const blocked = options.moduleKey
            ? await gateModuleApi("quikpresales", options.moduleKey, orgId)
            : null;
          response = blocked
            ? (blocked as NextResponse)
            : await handler(
                { session, userId: session.user.id, orgId },
                req,
                routeCtx ?? ({ params: {} as Params }),
              );
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        {
          success: false,
          error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed"),
        },
        { status: 500 },
      );
    }

    // Fire-and-forget API call log. Never blocks the response.
    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "quikpresales",
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

/**
 * Curry factory for module-gated route files, so every handler in the file
 * inherits the same gate:
 *
 *   const withEngagementAuth = withOrgAuthForModule("engagements");
 *   export const GET = withEngagementAuth(async ({ orgId }, req) => { ... });
 */
export function withOrgAuthForModule(moduleKey: string) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithOrgAuthOptions = {},
  ) => withOrgAuth<Params>(handler, { moduleKey, ...options });
}
