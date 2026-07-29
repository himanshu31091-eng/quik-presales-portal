import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Liveness probe. Returns 200 with the app name + commit SHA if available.
 * Public endpoint — keep it that way (no DB calls, no auth, no PII).
 */
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
