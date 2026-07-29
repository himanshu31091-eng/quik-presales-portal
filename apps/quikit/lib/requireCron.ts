/**
 * Cron endpoint guard.
 *
 * Vercel Cron sends a bearer token in the `Authorization` header when it fires
 * scheduled jobs. Locally we accept `?secret=<CRON_SECRET>` as an escape hatch
 * for manual/curl testing. Any other caller is rejected with 401.
 *
 * Set CRON_SECRET in env (Vercel project settings + .env.local for dev).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function requireCron(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured → fail closed so a misconfigured deployment can't
    // expose the cron handlers as a public DoS surface.
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return null;

  const secretParam = req.nextUrl.searchParams.get("secret");
  if (secretParam === expected) return null;

  return NextResponse.json(
    { success: false, error: "Unauthorized cron request" },
    { status: 401 },
  );
}
