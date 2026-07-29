import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Mirrors apps/admin/app/api/org/memberships/route.ts.
 * Lists the orgs the current user belongs to — used by the launcher /apps org switcher.
 *
 * Response shape includes both `orgId` (preferred) and `tenantId` (back-compat
 * for any client code that hasn't been renamed yet).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.orgMember.findMany({
    where: { userId: session.user.id, status: "active" },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const data = memberships.map((m) => ({
    membershipId: m.id,
    orgId: m.org.id,
    tenantId: m.org.id, // back-compat alias
    name: m.org.name,
    slug: m.org.slug,
    description: m.org.description,
    role: m.role,
    status: m.status,
  }));

  return NextResponse.json({ success: true, data });
}
