import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Launcher (3000) + OAuth IdP. When NEXT_PUBLIC_AUTH_URL points at `apps/auth` (3004),
 * `/login` is NOT public — unauthenticated traffic is sent to central credentials login only.
 * Org selection happens inline on the launcher `/apps` page (no separate
 * select-org route any more).
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL?.replace(/\/$/, "");

// If NEXT_PUBLIC_AUTH_URL points at THIS host, the launcher serves /login
// itself. Detected at request time via header; below we just check origin.
// The build can't know the request origin, so we always treat /login as
// public on the launcher — the page exists either way (legacy /login is
// kept for self-hosted deploys).
const launcherPublicRoutes = [
  "/login",
  "/api/oauth/authorize",
  "/api/oauth/token",
  "/api/oauth/userinfo",
  "/api/oauth/jwks",
  "/.well-known/openid-configuration",
  // Native-invite acceptance — the "Set Up My Account" link in onboarding
  // emails now targets the launcher (:3001) so the Set-Password page is
  // served from here instead of bouncing to the auth app on :3000.
  // Both the page and its same-origin API fetches must be reachable
  // without a session because the user authenticates by presenting their
  // single-use invitation token (FRD FR-SA-009 / FR-SA-010).
  "/invitations/accept",
  "/api/invitations",
  // Cross-domain session handoff. The auth app's /api/post-login redirects
  // here with a short-lived HS256 token; we exchange it for a NextAuth
  // session cookie on this host (cookies cannot be shared across distinct
  // *.vercel.app subdomains).
  "/auth-handoff",
];

// Only set centralLoginUrl when AUTH_URL points at a DIFFERENT host.
// (When AUTH_URL === launcher's own URL, redirecting /login → /login loops.)
function isSelfHosted(authUrl: string | undefined): boolean {
  if (!authUrl) return true;
  const launcherUrl = process.env.NEXT_PUBLIC_QUIKIT_URL?.replace(/\/$/, "");
  return launcherUrl === authUrl;
}

const factory = createMiddleware({
  loginRoute: "/login",
  // The launcher's /apps page IS the org picker. Treat it as the
  // select-org route so the factory lets no-org users land there
  // (and doesn't loop them back out).
  selectOrgRoute: "/apps",
  postLoginRoute: "/apps",
  publicRoutes: launcherPublicRoutes,
  centralLoginUrl: isSelfHosted(AUTH_URL) ? undefined : `${AUTH_URL}/login`,
  // Super-admin routes — bypass the org-selection gate so super admins
  // without any OrgMember rows can still reach the launcher + super-admin
  // panels to bootstrap orgs.
  superAdminRoutes: [
    "/apps",
    "/app-registry",
    "/organizations",
    "/broadcasts",
    "/platform-users",
    "/audit",
    "/plans",
    "/analytics",
    "/feature-flags",
  ],
});

/**
 * Marketing paths are owned by the marketing zone (proxied via
 * next.config rewrites). They must NOT hit the auth factory (which would
 * bounce unauthenticated visitors to /login). Exact set + the two
 * prefixed trees. "/" is matched exactly — never via startsWith.
 */
const MARKETING_EXACT = new Set([
  "/",
  "/blog",
  "/sitemap.xml",
  "/robots.txt",
  "/platform",
  "/products",
  "/pricing",
  "/contact",
  "/quikcrm",
  "/quikinfra",
  "/quikscale",
  "/quiksocial",
  "/quiktrack",
]);

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_EXACT.has(pathname)) return true;
  return pathname.startsWith("/blog/") || pathname.startsWith("/assets/");
}

function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/apps";
}

/**
 * Build the central auth-app login URL with the launcher path baked into a
 * `callbackUrl` chain. The shared helper handles the cross-domain cookie
 * bridge: it routes the final hop through the auth app's `/api/post-login`
 * endpoint so the launcher gets a host-scoped session cookie after sign-in.
 *
 * Returns `null` when `NEXT_PUBLIC_AUTH_URL` isn't configured (dev),
 * leaving the caller to handle the same-host fallback.
 */
function buildExternalLoginUrl(
  request: NextRequest,
  callbackPath: string,
): string | null {
  if (!AUTH_URL) return null;
  const launcherUrl =
    process.env.NEXT_PUBLIC_QUIKIT_URL?.replace(/\/$/, "") ??
    request.nextUrl.origin;
  const safeCallback = callbackPath.startsWith("/") ? callbackPath : "/apps";
  return buildLoginUrl({
    appUrl: launcherUrl,
    postLoginPath: safeCallback,
    authUrl: AUTH_URL,
  });
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // This host's own public origin (NEXTAUTH_URL / X-Forwarded-Host), never the
  // pod bind address that `request.url` resolves to behind the ingress.
  const base = publicBaseUrl(request);

  // Marketing zone — let the rewrite proxy it; never auth-gate it.
  if (isMarketingPath(pathname)) return NextResponse.next();

  // The standalone /login page is retired — every "Log in" CTA across the
  // platform now redirects to the central auth app. Anything pointed at
  // /login (old bookmarks, factory fallbacks) is bounced to
  // `${AUTH_URL}/login?callbackUrl=…`, carrying the intended post-login
  // destination so NextAuth returns the user there after sign-in.
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    const callback = safeNext(
      request.nextUrl.searchParams.get("callbackUrl"),
    );
    const external = buildExternalLoginUrl(request, callback);
    if (external) return NextResponse.redirect(external);
    // Self-hosted dev fallback — keep the path on /apps (the launcher),
    // letting the factory below handle the unauthenticated bounce.
    const url = new URL(callback, base);
    return NextResponse.redirect(url);
  }

  const res = await factory(request);

  // The factory bounces unauthenticated users to the login route. Rewrite
  // that to the external auth-app login + callbackUrl, carrying the
  // original path (incl. ?handoff=&to= for cross-app SSO) so login resumes
  // exactly where the user was headed.
  if (res && (res.status === 307 || res.status === 308)) {
    const loc = res.headers.get("location") ?? "";
    try {
      const locUrl = new URL(loc, base);
      const sameHost = locUrl.host === new URL(base).host;
      if (sameHost && locUrl.pathname.startsWith("/login")) {
        const external = buildExternalLoginUrl(
          request,
          `${pathname}${search}`,
        );
        // Re-apply cookie eviction: replacing the factory's redirect with our
        // external one would otherwise drop the factory's Set-Cookie deletions,
        // leaving the stale cookie in the browser.
        if (external) return clearSessionCookies(NextResponse.redirect(external));
      }
    } catch {
      /* non-URL location — leave the factory response as-is */
    }
  }

  return res;
}

export const config = {
  // Exclusions:
  //   api/             — API routes have their own auth wrappers
  //   _next/static     — Next.js compiled assets
  //   _next/image      — Next.js image-optimization endpoint
  //   app-icons/       — public/app-icons (logos shown on the launcher pre-auth)
  //   auth/            — public/auth/* (shared SignInComponent assets used
  //                       by the invitation flow rendered here)
  //   favicon.ico      — browser-requested
  // Add new public-asset paths here when they're served from /public.
  matcher: ["/((?!api/|_next/static|_next/image|app-icons/|auth/|favicon.ico).*)"],
};
