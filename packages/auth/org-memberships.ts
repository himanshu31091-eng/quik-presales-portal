/**
 * Shared factory for `GET /api/org/memberships` route handlers.
 *
 * Returns the active memberships of the current user. Optional `appSlug`
 * filter narrows the list to tenants where the user has access to a
 * specific app — necessary so that, e.g., the QuikVC org switcher only
 * shows tenants where QuikVC is enabled (rather than every tenant the
 * user belongs to, including QuikScale-only ones).
 *
 * Same pattern as `createGetOrgId` / `createRequireAdmin`: each app
 * instantiates the factory at the top of its route file and exports the
 * resulting handler.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession, type NextAuthOptions } from "next-auth";
import { db } from "@quikit/database";

export interface OrgMembershipsConfig {
  /** When set, only tenants where the current user has UserAppAccess for
   *  this app slug are returned. Use "quikvc", "quikscale", etc. */
  appSlug?: string;
}

export interface OrgInfo {
  membershipId: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  plan: string;
  role: string;
  status: string;
  invitedAt: Date | null;
  acceptedAt: Date | null;
}

export function createOrgMembershipsHandler(
  authOptions: NextAuthOptions,
  config: OrgMembershipsConfig = {},
) {
  return async function GET(_req: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Resolve the app id once if filtering is requested.
    let appId: string | null = null;
    if (config.appSlug) {
      const app = await db.app.findUnique({
        where: { slug: config.appSlug },
        select: { id: true },
      });
      // If the app row doesn't exist yet (registry not seeded), skip the
      // filter — surfacing zero memberships would be a worse UX than
      // showing all of them. Caller can monitor logs to detect missing app.
      appId = app?.id ?? null;
    }

    const memberships = await db.orgMember.findMany({
      where: {
        userId,
        // Only show orgs the user is actively a member of.
        status: "active",
        // Only show orgs that aren't suspended/disabled — a suspended org
        // shouldn't appear in the launcher dropdown or anywhere else for
        // the end user. Super-admins manage suspended orgs through the
        // super-admin portal, not the user-level launcher.
        org: {
          status: "active",
          // Optionally also filter to orgs where user has access to a
          // specific app (skipped when appSlug isn't set / app row missing).
          ...(appId
            ? {
                userAppAccess: {
                  some: { userId, appId },
                },
              }
            : {}),
        },
      },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            logoUrl: true,
            brandColor: true,
            plan: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const orgs: OrgInfo[] = memberships.map((m) => ({
      membershipId: m.id,
      orgId: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      description: m.org.description,
      logoUrl: m.org.logoUrl,
      brandColor: m.org.brandColor,
      plan: m.org.plan,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
    }));

    return NextResponse.json({ success: true, data: orgs });
  };
}
