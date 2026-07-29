import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { activateMembership } from "@/lib/invitations";
import { db } from "@/lib/db";

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Public endpoint — email/password invitation acceptance. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const result = await activateMembership(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  const user = await db.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  // Encode a NextAuth JWT directly — matches the JWT shape produced by @quikit/auth
  // (uses `id` not `userId`, and `orgId` not `tenantId`).
  const jwtToken = {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    picture: user.avatar ?? undefined,
    orgId: result.orgId,
    membershipRole: result.role,
  };

  const encoded = await encode({ token: jwtToken, secret: process.env.NEXTAUTH_SECRET! });
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");
  const cookieName = useSecureCookies
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const response = NextResponse.json({
    success: true,
    data: { orgId: result.orgId, tenantId: result.orgId, role: result.role },
  });
  response.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: !!useSecureCookies,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
