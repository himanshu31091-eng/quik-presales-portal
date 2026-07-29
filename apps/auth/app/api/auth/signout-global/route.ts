import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth-host single-logout endpoint.
 *
 * Mirror of the launcher's `/api/auth/signout-global` (apps/quikit/...).
 * Required because the cross-domain login chain plants three host-only
 * cookies — one on the auth host, one on the launcher, one on each
 * sub-app — and a full logout must clear all of them. The `globalSignOut`
 * helper now chains:
 *
 *   1. localSignOut()      → clears the originating app's cookie
 *   2. <auth>/api/auth/signout-global?callbackUrl=<next>
 *   3. <quikit>/api/auth/signout-global?callbackUrl=<final>
 *   4. <final>             → marketing/landing page on the originating app
 *
 * callbackUrl validation: same-origin always allowed. Cross-origin allowed
 * only when the destination matches the documented Vercel UAT / GKE prod
 * hostnames (extensible via `AUTH_ALLOWED_RETURN_ORIGINS`). Anything else
 * falls back to this host's `/login` so we never become an open redirector.
 */

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
  "https://quikhrms.vercel.app",
  "https://people.quikit.ai",
  "https://support.quikit.ai",
  "https://asset.quikit.ai",
  // UAT custom domains (uat<app>.quikit.ai) — added alongside prod.
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
  const fallback = new URL("/login", req.nextUrl.origin);
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, req.nextUrl.origin);
    if (parsed.origin === req.nextUrl.origin) return parsed;
    if (allowedOrigins().has(parsed.origin)) return parsed;
    // Local dev: sub-apps run on localhost:<port> (e.g. quikasset :3012),
    // which aren't in the prod/UAT allow-list above. Permit any localhost
    // origin when not in production so the SLO chain can forward to the
    // launcher hop and ultimately back to the originating dev app.
    if (process.env.NODE_ENV !== "production" && parsed.hostname === "localhost") {
      return parsed;
    }
  } catch {
    // Malformed URL — fall through.
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const redirectTo = resolveRedirect(req);
  const response = NextResponse.redirect(redirectTo);

  for (const name of NEXT_AUTH_COOKIES) {
    const isSecurePrefix =
      name.startsWith("__Secure-") || name.startsWith("__Host-");
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

export const POST = GET;
