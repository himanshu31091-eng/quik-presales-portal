import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/org/select
 * Validates tenant access and returns role for session update.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await request.json();
  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId required" }, { status: 400 });
  }

  const membership = await db.orgMember.findFirst({
    // `org: { status: "active" }` blocks selecting a suspended org even for a
    // user who still has an active membership row — suspension disables the
    // whole org, not just new members. Mirrors @quikit/auth/org-select.
    where: { userId: session.user.id, orgId, status: "active", org: { status: "active" } },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: { orgId: membership.orgId, membershipRole: membership.role },
  });
}
