/**
 * Dual-auth guard for endpoints that are triggered either by a scheduled
 * cron (with CRON_SECRET) OR manually by a super admin from the UI.
 *
 * Accepts:
 *   - Authorization: Bearer <CRON_SECRET> header  → external scheduler
 *   - ?secret=<CRON_SECRET> query string          → manual curl / uptimerobot
 *   - Valid super-admin session cookie            → button click from UI
 *
 * Returns:
 *   - `null` if authenticated (go ahead)
 *   - A 401 `NextResponse` otherwise
 *
 * Plus: always returns the caller identity for logging / audit ("cron" or
 * the super admin's userId).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

export interface CronOrSuperAdminResult {
  blocked: NextResponse | null;
  /** "cron" for secret-auth calls, userId string for UI calls. */
  triggeredBy: string;
}

export async function requireCronOrSuperAdmin(req: NextRequest): Promise<CronOrSuperAdminResult> {
  const expected = process.env.CRON_SECRET;

  // 1. Try cron secret first (fast path — no DB hit)
  if (expected) {
    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${expected}`) {
      return { blocked: null, triggeredBy: "cron" };
    }
    const secretParam = req.nextUrl.searchParams.get("secret");
    if (secretParam === expected) {
      return { blocked: null, triggeredBy: "cron" };
    }
  }

  // 2. Fall back to super admin session
  const auth = await requireSuperAdmin();
  if ("error" in auth) {
    return {
      blocked: NextResponse.json(
        { success: false, error: "Requires CRON_SECRET or super admin session" },
        { status: 401 },
      ),
      triggeredBy: "",
    };
  }

  return { blocked: null, triggeredBy: auth.userId };
}
