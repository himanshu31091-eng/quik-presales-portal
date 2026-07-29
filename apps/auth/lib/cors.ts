import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Narrow CORS allow-list for the password-reset endpoints only.
 *
 * The QuikIT login modal lives in the standalone marketing app. Before the
 * domain flip it runs on a different origin than this auth service, so the
 * forgot-password / verify-otp / reset-password calls are cross-origin
 * (F2). These endpoints do NOT set the session cookie (they email an OTP,
 * return a one-shot resetToken, or set a password), so reflecting a
 * trusted origin without credentials is safe. After the flip the modal is
 * same-origin and CORS is moot (harmless).
 *
 * Origins are env-overridable via AUTH_CORS_ORIGINS (comma-separated).
 */
// Allow-list is env-only. Prod sets `AUTH_CORS_ORIGINS` to a comma-separated
// list of trusted origins (the launcher + the auth host, plus any preview
// hostnames you care about). Dev falls back to localhost only — no
// hardcoded Vercel hostnames in this file.
const DEV_FALLBACK_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

const ALLOWED = (
  process.env.AUTH_CORS_ORIGINS
    ? process.env.AUTH_CORS_ORIGINS.split(",").map((s) => s.trim())
    : DEV_FALLBACK_ORIGINS
).filter(Boolean);

function headersFor(origin: string | null): Record<string, string> {
  if (origin && ALLOWED.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return { Vary: "Origin" };
}

/** Wrap a route POST handler so its response carries CORS headers. */
export function withCors(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const res = await handler(req);
    const h = headersFor(req.headers.get("origin"));
    for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
    return res;
  };
}

/** Re-export as `OPTIONS` from each route for preflight. */
export function preflight(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: headersFor(req.headers.get("origin")),
  });
}
