/**
 * Shared factory for `POST /api/org/select` route handlers.
 *
 * Validates that the current user has an active Membership for the
 * requested orgId, optionally that the user has access to the requested
 * app (when `appSlug` is configured), and returns the role so the client
 * can update the JWT via `useSession().update()`.
 *
 * Pair with createOrgMembershipsHandler — they share the same appSlug
 * scope so the picker and the selector enforce identical rules.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession, type NextAuthOptions } from "next-auth";
import { db } from "@quikit/database";

export interface OrgSelectConfig {
  /** When set, also requires the user to have UserAppAccess for this app
   *  in the chosen tenant. Returns 403 otherwise. */
  appSlug?: string;
}

const bodySchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

export function createOrgSelectHandler(
  authOptions: NextAuthOptions,
  config: OrgSelectConfig = {},
) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { orgId } = parsed.data;
    const userId = session.user.id;

    // 1. Active membership in an active (non-suspended) tenant. The
    //    `org: { status: "active" }` clause means a suspended org can't be
    //    selected even by a user who still has an active membership row —
    //    suspension blocks the whole org, not just new members.
    const membership = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active", org: { status: "active" } },
      select: { orgId: true, role: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "No active membership for this organisation" },
        { status: 403 },
      );
    }

    // 2. App access for this app in this tenant (optional)
    if (config.appSlug) {
      const app = await db.app.findUnique({
        where: { slug: config.appSlug },
        select: { id: true },
      });
      if (app) {
        const access = await db.userAppAccess.findUnique({
          where: { userId_orgId_appId: { userId, orgId, appId: app.id } },
          select: { id: true },
        });
        if (!access) {
          return NextResponse.json(
            {
              success: false,
              error: `You don't have access to ${config.appSlug} in this organisation`,
            },
            { status: 403 },
          );
        }
      }
      // Silent passthrough when the app row is missing (registry not seeded
      // yet). Same compromise as createOrgMembershipsHandler — preferable
      // to a confusing 403 during platform setup.
    }

    return NextResponse.json({
      success: true,
      data: { orgId: membership.orgId, membershipRole: membership.role },
    });
  };
}
