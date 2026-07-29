/**
 * Cross-app login URL builder.
 *
 * Every sub-app's "Log in" CTA on its marketing/landing surface should bounce
 * the user to the central auth app (`NEXT_PUBLIC_AUTH_URL/login`) carrying a
 * `callbackUrl` query param so NextAuth returns the user to the right place
 * once they've authenticated.
 *
 * Why centralise this:
 *   - One place to know the auth URL is built from `NEXT_PUBLIC_AUTH_URL`.
 *     Literal `process.env.NEXT_PUBLIC_AUTH_URL` access — see env.ts for why
 *     dynamic access breaks webpack inlining in client components.
 *   - Consistent dev fallback (auth app on :3001) across apps.
 *   - Single helper means quikit + quikscale (and future sub-apps) can't
 *     drift in URL-encoding behaviour or default destinations.
 *
 * Usage (client component):
 *   import { buildLoginUrl } from "@quikit/shared/login-url";
 *   <a href={buildLoginUrl({ appUrl: process.env.NEXT_PUBLIC_QUIKSCALE_URL,
 *                            postLoginPath: "/dashboard" })}>Log in</a>
 *
 * NextAuth strips cross-origin `callbackUrl` values by default. The auth app
 * has a `callbacks.redirect` allow-list (see `packages/auth/index.ts`) that
 * permits the QuikIT sub-apps' origins — otherwise the user would land back
 * on the auth app's own origin after sign-in.
 */

const DEFAULT_AUTH_URL_DEV = "http://localhost:3001";

export interface BuildLoginUrlOptions {
  /**
   * The base URL of the app the user is currently on
   * (e.g. `https://quikscale.vercel.app`). `postLoginPath` is appended to
   * this to form the absolute `callbackUrl`. Pass `undefined` to skip the
   * callback param — sign-in will then land on the auth app's default
   * post-login destination (launcher `/apps`).
   */
  appUrl?: string | null;
  /**
   * Path within `appUrl` to return the user to after successful sign-in.
   * Defaults to `/dashboard` (the common landing for every sub-app).
   * Ignored when `appUrl` is falsy.
   */
  postLoginPath?: string;
  /**
   * Optional override for the auth host. Defaults to
   * `process.env.NEXT_PUBLIC_AUTH_URL`, then `http://localhost:3001`.
   * Pass an explicit value when calling from a context where the env var
   * isn't inlined (e.g. a build script).
   */
  authUrl?: string;
}

export function buildLoginUrl(options: BuildLoginUrlOptions = {}): string {
  const {
    appUrl,
    postLoginPath = "/dashboard",
    authUrl: authUrlOverride,
  } = options;

  // Literal env access — webpack DefinePlugin can only statically replace
  // `process.env.NEXT_PUBLIC_AUTH_URL` (not dynamic lookups). See env.ts.
  const authUrl =
    (authUrlOverride ?? process.env.NEXT_PUBLIC_AUTH_URL ?? DEFAULT_AUTH_URL_DEV)
      .replace(/\/$/, "");

  if (!appUrl) {
    return `${authUrl}/login`;
  }

  // The final destination on the target sub-app's own origin.
  const finalCallback = `${appUrl.replace(/\/$/, "")}${postLoginPath}`;

  // Cross-domain cookie bridge.
  //
  // NextAuth credentials sign-in sets a host-only cookie on the auth app's
  // origin. The shared sign-in component then does
  // `window.location.assign(callbackUrl)` — a direct browser navigation. If
  // we pointed `callbackUrl` straight at `finalCallback` (a different
  // origin), the target host would have no cookie and the user would be
  // bounced back to the landing page.
  //
  // Instead we route through `${authUrl}/api/post-login?callbackUrl=…`,
  // which is on the AUTH host (cookie present), reads the freshly-created
  // session, mints a 120-second HS256 handoff token signed with
  // `INTERNAL_SECRET`, and redirects to `${target}/auth-handoff?token=…`
  // — where the target sub-app exchanges the token for its own
  // host-scoped session cookie before redirecting to `finalCallback`'s
  // path.
  //
  // Same-origin callbacks skip the bridge — when `appUrl` matches `authUrl`
  // there's no cookie problem to solve and the extra hop just slows
  // sign-in down.
  const sameOrigin = (() => {
    try {
      return new URL(finalCallback).origin === authUrl;
    } catch {
      return false;
    }
  })();

  if (sameOrigin) {
    return `${authUrl}/login?callbackUrl=${encodeURIComponent(finalCallback)}`;
  }

  const bridge = `${authUrl}/api/post-login?callbackUrl=${encodeURIComponent(finalCallback)}`;
  return `${authUrl}/login?callbackUrl=${encodeURIComponent(bridge)}`;
}
