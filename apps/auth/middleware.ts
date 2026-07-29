import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";

/**
 * auth.quikit.ai middleware.
 *
 * This is the *central* login host, so it never delegates to itself.
 * - Unauthenticated users can freely hit all (auth) pages.
 * - Authenticated users hitting /login get bounced to the launcher
 *   (NEXT_PUBLIC_LAUNCHER_URL) or admin panel if they are super admin.
 *   Org selection happens on the launcher /apps, not a page here.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // This host's own public origin (NEXTAUTH_URL / X-Forwarded-Host), never the
  // pod bind address that `req.url` resolves to when the ingress doesn't
  // preserve the Host header — that was leaking `https://0.0.0.0:3001/login`
  // into user-facing redirects. See @quikit/auth/public-url.
  const base = publicBaseUrl(req);

  const PUBLIC = [
    "/login",
    "/signup",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    // Native-invite acceptance — landing page + API are reachable without
    // a session because the user authenticates by presenting their
    // single-use invitation token (FRD FR-SA-009 / FR-SA-010).
    "/invitations/accept",
    "/api/invitations",
    "/api/auth",
    "/api/verify-token",
    // Liveness probe — must be reachable without a session so Cloud Run /
    // GKE health checks succeed before any user logs in.
    "/api/health",
  ];
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  async function isRedisSessionStillValid(): Promise<boolean> {
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!internalSecret) return true; // fail-open when auth internal secret is not configured
    try {
      const res = await fetch(new URL("/api/verify-token", req.url), {
        method: "GET",
        headers: {
          "x-internal-secret": internalSecret,
          cookie: req.headers.get("cookie") ?? "",
          accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) return true; // fail-open on temporary backend issues
      const body = (await res.json()) as { valid?: boolean };
      return Boolean(body.valid);
    } catch {
      return true;
    }
  }

  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL("/login", base));
  }

  if (token && pathname.startsWith("/login")) {
    const validSession = await isRedisSessionStillValid();
    if (!validSession) {
      // The JWT decodes (valid signature) but its Redis session is gone. Show
      // the login page AND evict the dead cookie so the browser stops replaying
      // it — this is what lets a user with stale site data on authn.quikit.ai
      // recover without manually clearing cookies.
      return clearSessionCookies(NextResponse.next());
    }
    const callback = req.nextUrl.searchParams.get("callbackUrl");
    if (callback) {
      try {
        const callbackUrl = new URL(callback, base);
        // Cross-origin callback → route through /api/post-login so the
        // target sub-app gets a host-scoped session cookie via the
        // /auth-handoff bridge. Same-origin callbacks (the auth app
        // itself, or a relative /path) can short-circuit.
        if (callbackUrl.origin !== new URL(base).origin) {
          const bridge = new URL("/api/post-login", base);
          bridge.searchParams.set("callbackUrl", callbackUrl.toString());
          return NextResponse.redirect(bridge);
        }
        return NextResponse.redirect(callbackUrl);
      } catch {
        // fall through
      }
    }
    // Super admins land on the launcher /apps like everyone else; they
    // reach the org-admin portal via the Super Admin capsule rendered on
    // the launcher header. Auto-redirecting them away from /apps surprised
    // users who explicitly wanted the launcher view (e.g. OAuth login,
    // which has no callbackUrl and previously fell through to admin).
    const launcherUrl =
      process.env.NEXT_PUBLIC_LAUNCHER_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
    if (launcherUrl) {
      const apps = `${launcherUrl.replace(/\/+$/, "").replace(/\/apps$/, "")}/apps`;
      const bridge = new URL("/api/post-login", base);
      bridge.searchParams.set("callbackUrl", apps);
      return NextResponse.redirect(bridge);
    }
    // No launcher URL configured (shouldn't happen in any real deploy) —
    // let the authenticated user stay rather than bounce to a removed page.
    return NextResponse.next();
  }

  if (!token && !isPublic) {
    // No decodable token — evict any stale/expired NextAuth cookies on the way
    // to login so the browser stops replaying a dead cookie (auto-recovers
    // users with stale site data; deletes are no-ops when no cookie is present).
    return clearSessionCookies(NextResponse.redirect(new URL("/login", base)));
  }

  return NextResponse.next();
}

export const config = {
  // Excludes:
  //   _next/static  — Next.js compiled assets
  //   _next/image   — Next.js image optimisation
  //   favicon.ico   — browser-requested
  //   auth/         — public/auth/* (login-bg.webp, quikit-logo-*.png served
  //                   by the new login UI). Without this exclusion the
  //                   middleware redirects asset requests to /login and the
  //                   page renders with broken image icons.
  //   brand/        — public/brand/* (quikit-wordmark-*.svg rendered by the
  //                   sign-in / sign-up logo). Same broken-icon reason as auth/.
  matcher: ["/((?!_next/static|_next/image|auth/|brand/|favicon.ico).*)"],
};
