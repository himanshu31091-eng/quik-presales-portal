import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing" }, { status: 400 });
  }

  const membership = await db.orgMember.findFirst({
    where: { invitationToken: token },
    include: {
      user: { select: { firstName: true, email: true } },
      org: { select: { name: true } },
    },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "revoked" });
  }

  if (membership.status === "active" || membership.status === "inactive") {
    return NextResponse.json({ valid: false, reason: "used" });
  }

  return NextResponse.json({
    valid: true,
    firstName: membership.user.firstName,
    orgName: membership.org.name,
    email: membership.user.email,
  });
}
