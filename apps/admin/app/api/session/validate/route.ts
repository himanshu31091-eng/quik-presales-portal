import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Mirrors apps/admin/app/api/session/validate/route.ts.
 * Re-validates that the current session's user still has an active membership
 * for the selected org. Polled by the shared SessionGuard.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { role: true, org: { select: { status: true } } },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  // A super-admin org suspension bounces the user to the launcher's org picker
  // (mirrors every other app). App-access is intentionally NOT gated here —
  // the admin portal's access is role-based via `requireAdmin` middleware.
  if (membership.org.status !== "active") {
    return NextResponse.json({ valid: false, reason: "org_suspended" });
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
