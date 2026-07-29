import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/org/memberships
 * Returns all organisations the current user belongs to.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.orgMember.findMany({
    // Hide suspended orgs from the launcher's org picker — a suspended org
    // should not be selectable or even visible to its members. Mirrors
    // @quikit/auth/org-memberships.
    where: { userId: session.user.id, org: { status: "active" } },
    include: {
      org: {
        select: {
          id: true, name: true, slug: true, description: true,
          logoUrl: true, brandColor: true, plan: true, status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const orgs = memberships.map((m) => ({
    membershipId: m.id,
    orgId: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    plan: m.org.plan,
    role: m.role,
    status: m.status,
  }));

  return NextResponse.json(
    { success: true, data: orgs },
    {
      // Per-user membership list. NEVER cache: an admin adding the user to a
      // new org must reflect on their very next /apps load. The previous
      // `max-age=30, stale-while-revalidate=60` served a pre-add snapshot
      // (SWR returns stale on the first post-expiry request), so a freshly
      // added org silently failed to appear in the launcher's org switcher.
      // Mirrors the launcher endpoint, which is no-store for the same reason.
      headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}
