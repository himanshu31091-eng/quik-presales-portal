import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { verifyTokenRemote } from "./verify-token-remote";
import { publicBaseUrl } from "./public-url";
import { clearSessionCookies } from "./session-cookies";

export interface MiddlewareConfig {
  loginRoute: string;
  selectOrgRoute?: string;
  publicRoutes: string[];
  superAdminRoutes?: string[];
  requireSuperAdmin?: boolean;
  /** Block non-admin members (org admins + super admins only). Uses JWT orgId + membershipRole. */
  requireAdmin?: boolean;
  /** Absolute URL to central login (e.g., "http://localhost:3004/login").
   *  When set, unauthenticated users are redirected here instead of a local login page. */
  centralLoginUrl?: string;
  /** Absolute URL to the central launcher /apps (org picker lives there),
   *  e.g. "https://quik-it-auth.vercel.app/apps". No-org / revoked-membership
   *  users are redirected here instead of a per-app select-org page. */
  centralSelectOrgUrl?: string;
  /** Route to redirect authenticated users hitting /login when no callbackUrl is set.
   *  Defaults to selectOrgRoute, then "/dashboard". */
  postLoginRoute?: string;
  /** Validate JWT remotely against the central auth service (Redis-backed).
   *  Defaults to true when `centralLoginUrl` is set and INTERNAL_SECRET exists. */
  enforceRemoteSessionValidation?: boolean;
}

// Single source of truth for which membership roles can pass `requireAdmin`
// gates. Imported from @quikit/shared so the launcher visibility filter, the
// per-app middleware, and the in-app permission helpers all agree on the set
// (super_admin / org_admin / legacy "admin"). The stale local copy that lived
// here previously omitted "org_admin", which silently bounced freshly-invited
// Org Admins out of the admin app on every click.
const ADMIN_ROLES = ADMIN_TIER_ROLES;

export function createMiddleware(config: MiddlewareConfig) {
  const shouldRemoteValidate =
    config.enforceRemoteSessionValidation ??
    Boolean(config.centralLoginUrl && process.env.INTERNAL_SECRET);

  let authBaseUrl: string | undefined;
  if (config.centralLoginUrl) {
    try {
      authBaseUrl = new URL(config.centralLoginUrl).origin;
    } catch {
      authBaseUrl = undefined;
    }
  }

  return async function middleware(request: NextRequest) {
    // Redirect loop detection: if we've redirected 3+ times, break the loop
    const redirectCount = parseInt(request.cookies.get("_redirect_count")?.value || "0", 10);
    if (redirectCount >= 3) {
      const response = NextResponse.next();
      response.cookies.delete("_redirect_count");
      return response;
    }

    /** Helper: redirect with loop counter */
    function safeRedirect(url: string | URL): NextResponse {
      const response = NextResponse.redirect(url);
      response.cookies.set("_redirect_count", String(redirectCount + 1), { maxAge: 30 });
      return response;
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const { pathname } = request.nextUrl;

    // This app's own public origin for building user-facing redirects. Never the
    // pod bind address (0.0.0.0:PORT) that `request.url` resolves to when the
    // ingress doesn't preserve the Host header. See ./public-url.
    const base = publicBaseUrl(request);

    // `"/"` must match ONLY the exact root, never as a prefix — otherwise
    // `pathname.startsWith("/")` is always true and every route becomes public,
    // silently disabling auth + remote session validation + org enforcement for
    // the whole app. All other entries keep prefix matching.
    const isPublicRoute = config.publicRoutes.some((r) =>
      r === "/" ? pathname === "/" : pathname.startsWith(r),
    );
    const isLoginRoute = pathname.startsWith(config.loginRoute);
    const isSelectOrgRoute = config.selectOrgRoute
      ? pathname.startsWith(config.selectOrgRoute)
      : false;
    const isSuperAdminRoute = config.superAdminRoutes?.some((r) => pathname.startsWith(r)) ?? false;

    // If we're running behind a central auth service, validate the cookie/token
    // against auth's /api/verify-token on protected routes. That endpoint now
    // uses verifyJWT() + Redis session lookup, so TTL expiry / revoke instantly
    // invalidates access across sibling apps.
    if (
      token &&
      shouldRemoteValidate &&
      !isPublicRoute &&
      !isLoginRoute &&
      authBaseUrl
    ) {
      const remote = await verifyTokenRemote({
        authUrl: authBaseUrl,
        internalSecret: process.env.INTERNAL_SECRET,
        cookie: request.headers.get("cookie") ?? undefined,
      });
      if (!remote.valid && !remote.error) {
        // Same callbackUrl preservation as the unauthenticated branch
        // below — keep the user heading back to where they were. Build
        // absolute URLs from the app's own public origin (never the pod
        // bind address) via publicBaseUrl.
        const callback = `${request.nextUrl.pathname}${request.nextUrl.search}`;
        const callbackAbsolute = new URL(callback, base).toString();
        let loginTarget: string;
        if (config.centralLoginUrl) {
          const central = new URL(config.centralLoginUrl);
          central.searchParams.set("reason", "session_expired");
          central.searchParams.set("callbackUrl", callbackAbsolute);
          loginTarget = central.toString();
        } else {
          const local = new URL(config.loginRoute, base);
          local.searchParams.set("reason", "session_expired");
          local.searchParams.set("callbackUrl", callback);
          loginTarget = local.toString();
        }
        // The JWT is still cryptographically valid (signed with NEXTAUTH_SECRET)
        // even though its Redis session is gone — evict it so the browser stops
        // replaying the dead cookie on every request (no manual clear needed).
        return clearSessionCookies(safeRedirect(loginTarget));
      }

      // Session is valid but the selected org was suspended while the user was
      // inside the app. Route them back to the launcher's org picker (the same
      // destination as the no-org case) on their next protected navigation —
      // reload or module click. Super admins are exempt (they manage suspended
      // orgs), and the select-org route itself is exempt so the launcher's own
      // /apps doesn't redirect-loop. `reason=org_suspended` lets app wrappers
      // skip their handoff rewrite and lets the launcher surface the popup.
      if (
        remote.valid &&
        remote.orgActive === false &&
        !token.isSuperAdmin &&
        !isSelectOrgRoute
      ) {
        if (config.centralSelectOrgUrl) {
          const target = new URL(config.centralSelectOrgUrl);
          target.searchParams.set("reason", "org_suspended");
          return safeRedirect(target.toString());
        }
        if (config.selectOrgRoute) {
          const target = new URL(config.selectOrgRoute, base);
          target.searchParams.set("reason", "org_suspended");
          return safeRedirect(target);
        }
      }

      // Session is valid and the org is active, but its free trial has lapsed
      // (or its subscription is past_due/canceled/expired). Bounce to the
      // launcher's org picker / billing surface with a reason marker, exactly
      // like the suspended-org case. Strict `=== false` so grandfathered orgs
      // (no Subscription row → undefined) and older auth hosts never gate.
      // Super admins are exempt; the select-org route itself is exempt so the
      // launcher's own /apps doesn't redirect-loop (it shows the upgrade UI).
      if (
        remote.valid &&
        remote.subscriptionActive === false &&
        !token.isSuperAdmin &&
        !isSelectOrgRoute
      ) {
        const reason = remote.trialExpired ? "trial_expired" : "subscription_inactive";
        if (config.centralSelectOrgUrl) {
          const target = new URL(config.centralSelectOrgUrl);
          target.searchParams.set("reason", reason);
          return safeRedirect(target.toString());
        }
        if (config.selectOrgRoute) {
          const target = new URL(config.selectOrgRoute, base);
          target.searchParams.set("reason", reason);
          return safeRedirect(target);
        }
      }
    }

    // Unauthenticated users → central login or local login.
    //
    // We always append `callbackUrl=<absolute-original-URL>` so the
    // login page (and any post-login bridge) can return the user to the
    // page they wanted, not the central post-login default. Without this
    // the auth host's middleware falls through to its "no callback"
    // branches (e.g. super-admin → admin URL), which is the wrong
    // destination for someone who was on /apps a moment ago.
    if (!token && !isPublicRoute) {
      const callback = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      const callbackAbsolute = new URL(callback, base).toString();
      // Evict any NextAuth cookies on the way out. `getToken` returned null —
      // either there is no cookie (deletes are harmless no-ops) or the cookie is
      // expired/undecodable, in which case clearing it stops the browser from
      // replaying a dead cookie on every request. This is what auto-recovers a
      // user with stale site data (e.g. apps.quikit.ai / authn.quikit.ai)
      // without making them manually clear cookies. `/login` and other public
      // routes are excluded, so the login page itself is never cleared mid-flow.
      if (config.centralLoginUrl) {
        const central = new URL(config.centralLoginUrl);
        central.searchParams.set("callbackUrl", callbackAbsolute);
        return clearSessionCookies(safeRedirect(central.toString()));
      }
      const local = new URL(config.loginRoute, base);
      local.searchParams.set("callbackUrl", callback);
      return clearSessionCookies(safeRedirect(local));
    }

    // Authenticated user on local login page → honor callbackUrl, else go to dashboard
    if (token && isLoginRoute) {
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
      if (callbackUrl) {
        // Only allow same-origin or absolute URLs that point back to this host
        try {
          const target = new URL(callbackUrl, base);
          if (target.origin === new URL(base).origin) {
            return safeRedirect(target);
          }
        } catch {
          // fall through to default redirect
        }
      }
      const redirectTo = config.postLoginRoute || config.selectOrgRoute || "/dashboard";
      return safeRedirect(new URL(redirectTo, base));
    }

    // Super-admin-only app: block non-super-admins
    if (config.requireSuperAdmin && token && !token.isSuperAdmin && !isLoginRoute) {
      const loginTarget = config.centralLoginUrl
        ? `${config.centralLoginUrl}?reason=unauthorized`
        : new URL(`${config.loginRoute}?reason=unauthorized`, base).toString();
      return safeRedirect(loginTarget);
    }

    // Org-level admin portal: members without admin role bounce to login with reason.
    if (
      config.requireAdmin &&
      token &&
      token.orgId &&
      !token.isSuperAdmin &&
      !ADMIN_ROLES.has(String(token.membershipRole ?? "")) &&
      !isLoginRoute
    ) {
      const loginTarget = config.centralLoginUrl
        ? `${config.centralLoginUrl}?reason=unauthorized`
        : new URL(`${config.loginRoute}?reason=unauthorized`, base).toString();
      return safeRedirect(loginTarget);
    }

    // If the JWT callback detected that membership was revoked, force re-selection
    if (token && token.membershipInvalid && !isSelectOrgRoute && !isPublicRoute && !isLoginRoute) {
      if (config.centralSelectOrgUrl) {
        return safeRedirect(config.centralSelectOrgUrl);
      }
      if (config.selectOrgRoute) {
        return safeRedirect(new URL(config.selectOrgRoute, base));
      }
    }

    // Org selection enforcement
    if (token && !token.orgId && !isSelectOrgRoute && !isPublicRoute) {
      if (isSuperAdminRoute && token.isSuperAdmin) {
        return NextResponse.next();
      }
      // Redirect to the central launcher /apps (cross-domain) or, on the
      // launcher itself, its local /apps org picker.
      if (config.centralSelectOrgUrl) {
        return safeRedirect(config.centralSelectOrgUrl);
      }
      if (config.selectOrgRoute) {
        return safeRedirect(new URL(config.selectOrgRoute, base));
      }
    }

    // Successful navigation — reset redirect counter
    const response = NextResponse.next();
    if (redirectCount > 0) {
      response.cookies.delete("_redirect_count");
    }
    return response;
  };
}
