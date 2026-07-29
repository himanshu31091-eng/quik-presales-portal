import { NextRequest, NextResponse } from "next/server";
import { encode, getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { z } from "zod";

// Accept both `orgId` (preferred, monorepo) and `tenantId` (back-compat,
// from the standalone build) to keep older clients working.
const schema = z.object({
  orgId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
}).refine((d) => d.orgId || d.tenantId, { message: "orgId is required" });

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.id) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  const userId = token.id as string;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }

  const orgId = parsed.data.orgId ?? parsed.data.tenantId!;

  const membership = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Not a member of this organisation" },
      { status: 403 },
    );
  }

  // Write the updated orgId directly into the JWT cookie so the next
  // request reads it without a client-side update() round-trip.
  const updatedToken = {
    ...token,
    orgId,
    membershipRole: membership.role,
    membershipCheckedAt: Date.now(),
  };
  const encoded = await encode({ token: updatedToken, secret: process.env.NEXTAUTH_SECRET! });

  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");
  const cookieName = useSecureCookies
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const response = NextResponse.json({ success: true, data: { orgId, role: membership.role } });
  response.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: !!useSecureCookies,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
