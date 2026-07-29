import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";


/**
 * POST /api/apps/enable
 *
 * Enables an app for the current org. Creates UserAppAccess records
 * for ALL active members of the tenant (so everyone can see the app
 * in their launcher). Admin-only.
 *
 * Body: { appId: string }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No org selected" }, { status: 403 });
  }

  // Check admin role
  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { role: true },
  });
  if (!membership || !["admin", "super_admin", "owner"].includes(membership.role)) {
    return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
  }

  const { appId } = await request.json();
  if (!appId) {
    return NextResponse.json({ success: false, error: "appId is required" }, { status: 400 });
  }

  // Verify app exists
  const app = await db.app.findUnique({ where: { id: appId }, select: { id: true } });
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  // Get all active members of this tenant (userId only — all we insert)
  const members = await db.orgMember.findMany({
    where: { orgId, status: "active" },
    select: { userId: true },
  });

  // Bulk-create access rows; ON CONFLICT DO NOTHING via skipDuplicates.
  // `count` is the number of *new* rows inserted (i.e., members who didn't
  // already have access). Relies on the @@unique([userId, orgId, appId])
  // constraint on UserAppAccess to detect duplicates.
  //
  // Replaces a loop that did N lookups + N creates per enable call (up to
  // ~1000 sequential DB round-trips at N=500 members). See
  // docs/plans/P0-2-apps-enable-n-plus-one.md.
  const { count: granted } = await db.userAppAccess.createMany({
    data: members.map((m) => ({
      userId: m.userId,
      orgId,
      appId,
      role: "member",
      grantedBy: session.user.id,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    success: true,
    data: {
      appId,
      membersGranted: granted,
      totalEligibleMembers: members.length,
    },
  });
}
