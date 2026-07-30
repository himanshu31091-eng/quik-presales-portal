import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Liveness probe. Returns 200 with the app name + commit SHA if available.
 * Public endpoint — keep it that way (no DB calls, no auth, no PII).
 *
 * Forced dynamic so the probe reports live process state on every call. Without
 * it Next prerenders this at build time and every request thereafter returns a
 * cached snapshot, which makes a liveness check meaningless.
 */
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: "quikpresales",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
  });
}
