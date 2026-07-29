import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { LRUCache } from "lru-cache";
import { db } from "@/lib/db";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import {
  generateIdToken,
  generateAccessToken,
  generateRefreshToken,
  verifyPKCE,
} from "@/lib/oauth";

/**
 * Per-lambda LRU cache for OAuthClient lookups (P0-4).
 *
 * The row rarely changes (only on client_secret rotation, which is manual).
 * Caching eliminates a DB round-trip on happy-path token requests.
 *
 * Size 100 ≫ our current client count (~3-5); 60 s TTL bounds staleness after
 * a secret rotation. Null lookups are NOT cached — otherwise an attacker who
 * guessed client_ids could pollute the cache. The rate limiter below stops
 * that attack regardless.
 */
const CLIENT_CACHE = new LRUCache<string, { clientSecret: string; scopes: string[] }>({
  max: 100,
  ttl: 60_000,
});

async function getOAuthClient(clientId: string) {
  const cached = CLIENT_CACHE.get(clientId);
  if (cached) return cached;
  const row = await db.oAuthClient.findUnique({
    where: { clientId },
    select: { clientSecret: true, scopes: true },
  });
  if (row) CLIENT_CACHE.set(clientId, row);
  return row;
}

/**
 * Bucket IPs to /24. One attacker can't trivially spray source IPs within
 * their own /24 to dodge the limit; a shared-office /24 still shares one
 * bucket of reasonable size.
 */
function ipSlash24(raw: string): string {
  if (!raw || raw === "anonymous") return "anon";
  const v4 = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1]!;
  const v6 = raw.split(":").slice(0, 3).join(":");
  return v6 || raw;
}

const FAIL_CLOSED = process.env.NODE_ENV === "production";
const RATE_LIMIT_ENABLED =
  process.env.OAUTH_TOKEN_RATE_LIMIT_ENABLED !== "false";

/**
 * POST /api/oauth/token — OAuth2 Token Endpoint
 *
 * Exchanges an authorization code for tokens:
 *   - access_token  (opaque)
 *   - id_token      (JWT signed with RSA)
 *   - refresh_token
 *
 * Supports grant_type: "authorization_code" and "refresh_token".
 * Authenticates the client via client_id + client_secret (Basic or body).
 */
export async function POST(request: NextRequest) {
  const body = await request.formData().catch(() => null);
  const params = body
    ? Object.fromEntries(body.entries())
    : await request.json().catch(() => ({}));

  const grantType = String(params.grant_type ?? "");

  // OAuth2 clients may authenticate via Basic auth header (client_secret_basic,
  // NextAuth default) OR via POST body (client_secret_post). RFC 6749 requires
  // servers to support Basic; many clients prefer POST. Accept either.
  let clientId = String(params.client_id ?? "");
  let clientSecret = String(params.client_secret ?? "");
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        clientId = clientId || decodeURIComponent(decoded.slice(0, sep));
        clientSecret = clientSecret || decodeURIComponent(decoded.slice(sep + 1));
      }
    } catch {
      // Fall through — malformed Basic header, let client auth fail below.
    }
  }

  // P0-4: rate limit BEFORE bcrypt + DB. Keyed on (clientId, /24 IP block) so
  // one attacker on one /24 can't DoS by burning bcrypt cycles against wrong
  // secrets. See docs/plans/P0-4-oauth-token-hardening.md.
  if (RATE_LIMIT_ENABLED) {
    const ipBlock = ipSlash24(getClientIp(request));
    const { ok } = await rateLimitAsync({
      routeKey: "oauth:token",
      clientKey: `${clientId || "unknown"}:${ipBlock}`,
      limit: 30,
      windowMs: 60_000,
      failClosed: FAIL_CLOSED,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "too_many_requests", error_description: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
  }

  // Authenticate the client (through 60 s LRU cache).
  const client = await getOAuthClient(clientId);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 401 },
    );
  }

  const secretValid = await bcrypt.compare(clientSecret, client.clientSecret);
  if (!secretValid) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Bad client_secret" },
      { status: 401 },
    );
  }

  if (grantType === "authorization_code") {
    return handleAuthCodeExchange(params, clientId);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(params, clientId);
  }

  return NextResponse.json(
    { error: "unsupported_grant_type" },
    { status: 400 },
  );
}

async function handleAuthCodeExchange(
  params: Record<string, unknown>,
  clientId: string,
) {
  const code = String(params.code ?? "");
  const redirectUri = String(params.redirect_uri ?? "");
  const codeVerifier = params.code_verifier
    ? String(params.code_verifier)
    : null;

  // Look up the code
  const authCode = await db.oAuthCode.findUnique({ where: { code } });
  if (!authCode || authCode.clientId !== clientId) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired code" },
      { status: 400 },
    );
  }
  if (authCode.used || authCode.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Code expired or already used" },
      { status: 400 },
    );
  }
  if (authCode.redirectUri !== redirectUri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 },
    );
  }

  // PKCE validation
  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "code_verifier required (PKCE)" },
        { status: 400 },
      );
    }
    if (
      !verifyPKCE(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod ?? "S256",
      )
    ) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "PKCE verification failed" },
        { status: 400 },
      );
    }
  }

  // Mark code as used
  await db.oAuthCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  // Fetch user details for the id_token
  const user = await db.user.findUnique({
    where: { id: authCode.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "server_error", error_description: "User not found" },
      { status: 500 },
    );
  }

  // Fetch membership role
  const membership = await db.orgMember.findFirst({
    where: {
      userId: authCode.userId,
      orgId: authCode.orgId,
      status: "active",
    },
    select: { role: true },
  });

  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const idToken = await generateIdToken(
    {
      sub: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      tenant_id: authCode.orgId,
      role: membership?.role ?? "member",
      sessionId: authCode.sessionId ?? undefined,
    },
    clientId,
  );

  // Store refresh token + access token for userinfo lookup
  await db.oAuthRefreshToken.create({
    data: {
      token: refreshToken,
      accessToken,
      clientId,
      userId: authCode.userId,
      orgId: authCode.orgId,
      scopes: authCode.scopes,
      sessionId: authCode.sessionId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    id_token: idToken,
    scope: authCode.scopes.join(" "),
  });
}

async function handleRefreshToken(
  params: Record<string, unknown>,
  clientId: string,
) {
  const token = String(params.refresh_token ?? "");

  const stored = await db.oAuthRefreshToken.findUnique({
    where: { token },
  });
  if (
    !stored ||
    stored.clientId !== clientId ||
    stored.revoked ||
    stored.expiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
      { status: 400 },
    );
  }

  // Rotate: revoke old token, issue new one
  await db.oAuthRefreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  const user = await db.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }

  const membership = await db.orgMember.findFirst({
    where: {
      userId: stored.userId,
      orgId: stored.orgId,
      status: "active",
    },
    select: { role: true },
  });

  const newAccessToken = generateAccessToken();
  const newRefreshToken = generateRefreshToken();
  const idToken = await generateIdToken(
    {
      sub: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      tenant_id: stored.orgId,
      role: membership?.role ?? "member",
      sessionId: stored.sessionId ?? undefined,
    },
    clientId,
  );

  await db.oAuthRefreshToken.create({
    data: {
      token: newRefreshToken,
      accessToken: newAccessToken,
      clientId,
      userId: stored.userId,
      orgId: stored.orgId,
      scopes: stored.scopes,
      sessionId: stored.sessionId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshToken,
    id_token: idToken,
    scope: stored.scopes.join(" "),
  });
}
