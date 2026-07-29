/**
 * admin member-level API wrapper — like withAdminAuth but does not require
 * admin role. Accepts any user with an active OrgMember row in the selected
 * org. Used by routes that the launcher / member apps page hit.
 *
 * Uses session-based auth (getServerSession) so the JWT recheck cycle from
 * @quikit/auth applies.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiCall } from "@quikit/shared/apiLogging";

export interface MemberAuthContext {
  userId: string;
  orgId: string;
  role: string;
}

type Handler<Params> = (
  auth: MemberAuthContext,
  req: NextRequest,
  ctx: { params: Params },
) => Promise<NextResponse> | NextResponse;

export function withMemberAuth<Params = Record<string, never>>(handler: Handler<Params>) {
  return async (req: NextRequest, ctx?: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let response: NextResponse;
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;

    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        response = NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      } else {
        const orgId = session.user.orgId;
        if (!orgId) {
          response = NextResponse.json(
            { success: false, error: "No organisation selected" },
            { status: 400 },
          );
        } else {
          const membership = await db.orgMember.findFirst({
            where: { userId: session.user.id, orgId, status: "active" },
            select: { role: true },
          });
          if (!membership) {
            response = NextResponse.json(
              { success: false, error: "No active membership" },
              { status: 403 },
            );
          } else {
            orgIdForLog = orgId;
            userIdForLog = session.user.id;
            response = await handler(
              { userId: session.user.id, orgId, role: membership.role },
              req,
              ctx ?? ({ params: {} as Params }),
            );
          }
        }
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
