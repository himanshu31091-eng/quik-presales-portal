import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * admin portal middleware.
 *
 * Two-layer approach:
 *   1. `/auth-handoff` is allowed through publicly (the route mints the
 *      app's own session cookie from a launcher-signed JWT in `?token=`).
 *   2. For every other unauthenticated request, we let the @quikit/auth
 *      factory decide where to redirect — then if it points at the
 *      launcher's `/login`, we rewrite it to `/apps?handoff=admin&to=...`
 *      so the launcher transparently hands the user back to us with a
 *      valid token. This makes bookmarks + deep links work without a
 *      shared apex domain.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "admin";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/invitations", "/auth-handoff"],
  requireAdmin: true,
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  // Remote session validation (Redis TTL/revoke → session_expired) on every
  // protected nav in production only; dev relies on the JWT-callback Redis
  // soft-revocation. Explicit + identical across all apps (mirrors quiktrack).
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  const res = await factoryMiddleware(request);

  // If the factory is redirecting an UNAUTHENTICATED user to the launcher's
  // /login page, rewrite that to /apps?handoff=<slug>&to=<originalPath> so
  // the launcher can mint a hand-off token and bounce back to us.
  if (
    QUIKIT_URL &&
    (res.status === 307 || res.status === 308)
  ) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set(
        "to",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
