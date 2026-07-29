import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/get-user-id-from-request";

/**
 * POST /api/auth/select-org
 *
 * Verifies the caller is a member of the requested org, then returns the
 * membership role. The client calls `session.update({ orgId, membershipRole })`
 * after receiving this response so the JWT picks up the active tenant. Because
 * NEXTAUTH_SECRET is shared, every other app immediately trusts the updated JWT.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as { orgId?: string };
    const orgId = body.orgId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: "orgId required" }, { status: 400 });
    }
    const membership = await db.orgMember.findFirst({
      where: { orgId, userId, status: "active" },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "Not a member of this organization." }, { status: 403 });
    }
    return NextResponse.json({ success: true, orgId, role: membership.role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Select-org failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
