import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from "@quikit/shared";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateAuthCode } from "@/lib/oauth";

// Reads runtime session + env-backed OAuth keys — never prerender.
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/authorize — OAuth2 Authorization Endpoint
 *
 * Validates the client, checks user session, generates an auth code,
 * and redirects back to the client's redirect_uri with the code.
 *
 * Query params:
 *   client_id     — registered OAuth client ID (e.g., "quikscale")
 *   redirect_uri  — must match one of the client's registered URIs
 *   response_type — must be "code"
 *   scope         — space-separated scopes (e.g., "openid profile email tenant")
 *   state         — CSRF protection token (passed through unchanged)
 *   code_challenge — PKCE challenge (optional but recommended)
 *   code_challenge_method — "S256" (optional)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const scope = params.get("scope") ?? "openid";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";

  // Validate required params
  if (!clientId || !redirectUri || responseType !== "code") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing or invalid client_id, redirect_uri, or response_type" },
      { status: 400 },
    );
  }

  // Look up the OAuth client
  const client = await db.oAuthClient.findUnique({
    where: { clientId },
    select: { redirectUris: true, scopes: true },
  });
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 },
    );
  }

  // Validate redirect_uri against registered URIs
  if (!client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri not registered for this client" },
      { status: 400 },
    );
  }

  // Check user session (must be logged in)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Redirect to login, then back here after login
    const currentUrl = request.nextUrl.toString();
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(currentUrl)}`, request.nextUrl.origin),
    );
  }

  // The session callback doesn't surface the Redis session id, so read it off
  // the raw JWT. Carrying it onto the auth code lets the token endpoint stamp
  // it into the id_token, so the consumer app shares the central session id
  // and can be soft-invalidated from the shared session store.
  const jwt = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const sessionId = (jwt?.sessionId as string | undefined) ?? null;

  const userId = session.user.id;
  let orgId = session.user.orgId;
  let memberRole = session.user.membershipRole;

  if (!orgId) {
    // User hasn't selected an org yet — try to auto-select their first membership
    const membership = await db.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      orgId = membership.orgId;
      memberRole = membership.role;
    } else {
      // No membership at all → redirect to app launcher
      const currentUrl = request.nextUrl.toString();
      return NextResponse.redirect(
        new URL(`/apps?callbackUrl=${encodeURIComponent(currentUrl)}`, request.nextUrl.origin),
      );
    }
  }

  // Verify user has access to this app
  const app = await db.app.findFirst({
    where: { oauthClient: { clientId } },
    select: { id: true, slug: true, baseUrl: true },
  });
  if (app) {
    const access = await db.userAppAccess.findFirst({
      where: { userId, orgId, appId: app.id },
    });
    if (!access) {
      // The user is authenticated but not granted this app. Rather than
      // completing the OAuth handshake with `?error=access_denied` (which the
      // consumer's NextAuth callback turns into a generic error page, then the
      // app's /login re-fires signIn and loops), send them to the app's own
      // public landing page with a marker. There <AppAccessDeniedPopup />
      // shows an app-specific "contact your administrator" message.
      // Falls back to the launcher /apps if the app has no baseUrl configured.
      //
      // We ALSO tell the popup, authoritatively, how many OTHER apps this user
      // can reach, and where the launcher lives — because on the consumer app's
      // landing page there is no local session yet (the OAuth callback never
      // ran), so its own /api/apps/switcher would 401 and the popup couldn't
      // decide whether to show "Go to my apps". Here we still hold the central
      // session, so we compute it now using the exact launcher visibility rule.
      const otherAppsCount = await countOtherAccessibleApps({
        userId,
        orgId,
        excludeAppId: app.id,
        isSuperAdmin: session.user.isSuperAdmin === true,
        memberRole,
      });
      // Resolve the app's landing origin the SAME way the launcher does: a
      // per-app env override (e.g. QUIKSCALE_URL) wins over the DB's stored
      // baseUrl. Critical because App.baseUrl holds PRODUCTION URLs, so in local
      // dev a raw baseUrl redirect would bounce the user to prod. Falls back to
      // the DB baseUrl (prod) and finally this IdP's /apps.
      const appBaseUrl = process.env[`${app.slug.toUpperCase()}_URL`] || app.baseUrl;
      const target = appBaseUrl
        ? new URL("/", appBaseUrl)
        : new URL("/apps", request.nextUrl.origin);
      target.searchParams.set("reason", "no_app_access");
      target.searchParams.set("others", String(otherAppsCount));
      // The launcher (this IdP) origin — lets the popup's "Go to my apps" link
      // resolve without relying on NEXT_PUBLIC_QUIKIT_URL being set client-side.
      target.searchParams.set("home", process.env.QUIKIT_URL || request.nextUrl.origin);
      return NextResponse.redirect(target.toString());
    }
  }

  // Generate auth code
  const code = generateAuthCode();
  const scopes = scope.split(" ").filter(Boolean);

  await db.oAuthCode.create({
    data: {
      code,
      clientId,
      userId,
      orgId,
      scopes,
      codeChallenge: codeChallenge ?? null,
      codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
      redirectUri,
      sessionId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  // Redirect back to the client with the code
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  return NextResponse.redirect(callbackUrl.toString());
}

/**
 * Count the apps a user can reach in an org, EXCLUDING one app (the one they
 * were just denied). Mirrors the launcher/switcher visibility rule exactly
 * (apps/quikit/app/api/apps/launcher/route.ts):
 *   1. Org must have OrgAppAccess.enabled = true for the app.
 *   2. `requiresOrgAdmin` apps need an admin-tier caller.
 *   3. Org admins / super admins see every provisioned app; everyone else
 *      needs an explicit UserAppAccess row.
 * Used to decide whether the access-denied popup shows "Go to my apps".
 */
async function countOtherAccessibleApps(opts: {
  userId: string;
  orgId: string;
  excludeAppId: string;
  isSuperAdmin: boolean;
  memberRole?: string | null;
}): Promise<number> {
  const { userId, orgId, excludeAppId, isSuperAdmin, memberRole } = opts;
  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  const [allApps, orgAllows, userAccess] = await Promise.all([
    db.app.findMany({
      where: { status: { not: "disabled" }, slug: { notIn: ["quikit", ...HIDDEN_APP_SLUGS] } },
      select: { id: true, requiresOrgAdmin: true },
    }),
    db.orgAppAccess.findMany({ where: { orgId, enabled: true }, select: { appId: true } }),
    db.userAppAccess.findMany({ where: { userId, orgId }, select: { appId: true } }),
  ]);

  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));
  const userAppIds = new Set(userAccess.map((u) => u.appId));

  return allApps.filter((a) => {
    if (a.id === excludeAppId) return false;
    if (!orgAllowedAppIds.has(a.id)) return false;
    if (a.requiresOrgAdmin && !memberIsAdmin) return false;
    if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(a.id)) return false;
    return true;
  }).length;
}
