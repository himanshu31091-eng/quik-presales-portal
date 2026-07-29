import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";

/**
 * GET /api/auth/me — returns claims from the JWT (same source as middleware).
 */
export async function GET(req: NextRequest) {
  const token = await verifyJWT(req);
  const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
  if (!token || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      id: userId,
      email: (token.email as string | undefined) ?? null,
      orgId: (token.orgId as string | undefined) ?? null,
      membershipRole: (token.membershipRole as string | undefined) ?? null,
      isSuperAdmin: Boolean(token.isSuperAdmin),
    },
  });
}
