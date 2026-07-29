import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikpresales middleware (mirrors quiksupport / quiktrack).
 *
 *   - `/`             → public marketing landing. The page itself redirects
 *                       authenticated users on to /dashboard.
 *   - `/dashboard`    → auth required. Unauthenticated users are routed
 *                       through the launcher's `/apps?handoff=…` handshake to
 *                       pick up a cross-domain session cookie.
 *   - `/auth-handoff` → public, so the cookie bridge can plant that session.
 *
 * The wrapper below is what makes tile-click SSO work. The shared factory
 * sends an unauthenticated user to the central login page, but a user who is
 * already signed in at the launcher only needs the hand-off — so we intercept
 * that redirect and send them to the launcher's handoff endpoint instead,
 * carrying the path they originally asked for.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikpresales";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  // Remote validation costs a round trip per request; only worth it in prod,
  // where a revoked session must stop working promptly.
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  const res = await factoryMiddleware(request);

  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set("to", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
