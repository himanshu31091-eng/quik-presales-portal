import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/oauth/userinfo — OIDC UserInfo Endpoint
 *
 * Returns claims about the authenticated user. The access_token is
 * passed via the Authorization header as a Bearer token.
 *
 * Looks up the access token in the OAuthRefreshToken table (where it's
 * stored alongside the refresh token during the token exchange).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "invalid_token", error_description: "Missing Bearer token" },
      { status: 401 },
    );
  }

  const accessToken = authHeader.slice(7);

  // Look up the access token → find the user + tenant
  const tokenRecord = await db.oAuthRefreshToken.findFirst({
    where: {
      accessToken,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
    select: { userId: true, orgId: true, scopes: true, sessionId: true },
  });

  if (!tokenRecord) {
    return NextResponse.json(
      { error: "invalid_token", error_description: "Token not found or expired" },
      { status: 401 },
    );
  }

  const user = await db.user.findUnique({
    where: { id: tokenRecord.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401 },
    );
  }

  const membership = await db.orgMember.findFirst({
    where: {
      userId: user.id,
      orgId: tokenRecord.orgId,
      status: "active",
    },
    select: { role: true },
  });

  return NextResponse.json({
    sub: user.id,
    email: user.email,
    email_verified: true,
    name: `${user.firstName} ${user.lastName}`,
    given_name: user.firstName,
    family_name: user.lastName,
    picture: user.avatar,
    tenant_id: tokenRecord.orgId,
    role: membership?.role ?? "member",
    // Shared Redis session id minted by the central IdP. Consumer apps copy
    // this onto their NextAuth JWE (via the provider `profile()` callback) so
    // `verifyJWT` / the jwt soft-revoke can invalidate them from the shared
    // session store. Without it here, the OAuth profile carries no sessionId
    // and the Redis EXISTS check silently no-ops (TTL expiry never logs out).
    sessionId: tokenRecord.sessionId ?? undefined,
  });
}
