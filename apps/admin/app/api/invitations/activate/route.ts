import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { activateMembership } from "@/lib/invitations";
import { db } from "@/lib/db";

const schema = z.object({ token: z.string().min(1) });

/** Authenticated endpoint — OAuth invitation activation (no password needed). */
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.id) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
  }

  // Verify token belongs to the authenticated user's email
  const membership = await db.orgMember.findFirst({
    where: { invitationToken: parsed.data.token },
    include: { user: { select: { email: true } } },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Invitation not found or already revoked" },
      { status: 404 },
    );
  }

  if (membership.user.email !== (token.email as string)) {
    return NextResponse.json(
      { success: false, error: "This invitation belongs to a different email address" },
      { status: 403 },
    );
  }

  const result = await activateMembership(parsed.data.token);

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    data: { orgId: result.orgId, tenantId: result.orgId, role: result.role },
  });
}
