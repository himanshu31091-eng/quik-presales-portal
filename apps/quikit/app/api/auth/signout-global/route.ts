/**
 * Single-Logout (SLO) endpoint — clears the QuikIT IdP session cookie and
 * redirects to the login page. Invoked by relying-party apps (quikscale,
 * admin) as the last hop in their sign-out flow.
 *
 * Flow (global sign-out from quikscale, for example):
 *   1. User clicks "Sign out" in quikscale UserMenu.
 *   2. quikscale calls `signOut({ redirect: false })` — clears quikscale cookie.
 *   3. quikscale navigates browser to:
 *        https://quik-it-auth.vercel.app/api/auth/signout-global?callbackUrl=https://quik-it-auth.vercel.app/login
 *   4. We clear every NextAuth-issued cookie on the quikit origin and
 *      redirect to the callbackUrl.
 *
 * Why a GET (not POST): the browser arrives here via navigation from the
 * relying-party app. NextAuth's built-in /api/auth/signout is a POST with
 * CSRF — fine for in-app forms but awkward for cross-app redirects. A GET
 * endpoint that only clears our own cookies is safe because:
 *   • cookies are cleared on the same origin as the request.
 *   • no user data is mutated — purely a cookie reset.
 *   • callbackUrl is restricted to same-origin below to prevent open-redirect.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NextAuth cookies. Names differ between HTTPS (__Secure- / __Host- prefixed)
// and HTTP (plain). We clear both to cover dev + prod.
const NEXT_AUTH_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "__Secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__Secure-next-auth.state",
];

const DEFAULT_ALLOWED_ORIGINS = [
  "https://quik-it-auth.vercel.app",
  "https://quikscale.vercel.app",
  "https://quik-it-admin.vercel.app",
  "https://quiktrack.vercel.app",
  "https://quikvc.vercel.app",
  "https://quiksocial.vercel.app",
  "https://quikinfra.vercel.app",
  "https://apps.quikit.ai",
  "https://scale.quikit.ai",
  "https://orgadmin.quikit.ai",
  "https://track.quikit.ai",
  "https://crm.quikit.ai",
  "https://social.quikit.ai",
  "https://quikinfra.quikit.ai",
  "https://people.quikit.ai",
  "https://support.quikit.ai",
  "https://asset.quikit.ai",
  // UAT custom domains (uat<app>.quikit.ai) — added alongside prod.
  // Launcher /apps post-logout landing (the public marketing site) — not an app.
  "https://uat.quikit.ai",
  "https://uatapps.quikit.ai",
  "https://uatscale.quikit.ai",
  "https://uatorgadmin.quikit.ai",
  "https://uattrack.quikit.ai",
  "https://uatcrm.quikit.ai",
  "https://uatsocial.quikit.ai",
  "https://uatinfra.quikit.ai",
  "https://uatpeople.quikit.ai",
  "https://uatsupport.quikit.ai",
  "https://uatasset.quikit.ai",
];

function allowedOrigins(): Set<string> {
  const extra = (process.env.AUTH_ALLOWED_RETURN_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function resolveRedirect(req: NextRequest): URL {
  const raw = req.nextUrl.searchParams.get("callbackUrl");
  const fallback = new URL("/", req.nextUrl.origin);
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, req.nextUrl.origin);
    // Same-origin always allowed. Cross-origin allowed only when the
    // destination is in the cross-app allow-list — keeps this endpoint
    // from becoming an open redirector while still letting `globalSignOut`
    // land the user on the originating sub-app's landing page.
    if (parsed.origin === req.nextUrl.origin) return parsed;
    if (allowedOrigins().has(parsed.origin)) return parsed;
    // Local dev: sub-apps run on localhost:<port> (e.g. quikasset :3012),
    // which aren't in the prod/UAT allow-list above. Permit any localhost
    // origin when not in production so the SLO chain lands back on the
    // originating dev app instead of falling through to the launcher home.
    if (process.env.NODE_ENV !== "production" && parsed.hostname === "localhost") {
      return parsed;
    }
  } catch {
    // Malformed URL — fall through to fallback.
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const redirectTo = resolveRedirect(req);
  const response = NextResponse.redirect(redirectTo);

  for (const name of NEXT_AUTH_COOKIES) {
    // `__Secure-` / `__Host-` prefixed cookies REQUIRE secure: true on the
    // Set-Cookie directive, or the browser rejects it silently — leaving the
    // old cookie in place. That's the bug that let impersonation sessions
    // survive exit on prod. Match attributes to the originals.
    const isSecurePrefix = name.startsWith("__Secure-") || name.startsWith("__Host-");
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecurePrefix || process.env.NODE_ENV === "production",
      maxAge: 0,
      expires: new Date(0),
      path: "/",
    });
  }

  return response;
}

// Also support POST for clients that prefer a non-idempotent verb.
export const POST = GET;
