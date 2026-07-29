import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  verifyOtp,
  generateResetToken,
  storeResetToken,
  RESET_TOKEN_TTL_SECONDS,
} from "@/lib/otp-store";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { withCors, preflight } from "@/lib/cors";

/**
 * POST /api/auth/verify-otp
 *
 * Body: { email, otp }
 * - email: the address that received the code
 * - otp:   the 6-digit code the user typed
 *
 * On success, returns a one-shot `resetToken` (256-bit url-safe random
 * string) that the caller exchanges for a password update via
 * `POST /api/auth/reset-password`. The token lives 5 minutes in Redis under
 * `otp:reset-token:<token>` and is deleted on consumption.
 *
 * On failure we always return the same generic 400 — an attacker can't
 * tell whether they got the email wrong, the code wrong, or both.
 */

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const FAIL_CLOSED = process.env.NODE_ENV === "production";

const GENERIC_FAILURE = {
  success: false as const,
  error: "Invalid or expired code.",
};

async function postHandler(req: NextRequest) {
  try {
    // Per-IP throttle on the verify path itself — defends against rapid-fire
    // OTP guessing against many emails. The per-user 5-attempt counter is the
    // tighter bound; this is just a network-level cap.
    const ipRl = await rateLimitAsync({
      routeKey: "auth:verify-otp:ip",
      clientKey: getClientIp(req),
      limit: 30,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!ipRl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again later." },
        { status: 429, headers: { "retry-after": String(ipRl.retryAfterSeconds) } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(GENERIC_FAILURE, { status: 400 });
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(GENERIC_FAILURE, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (!user) {
      // Match the timing of a real verifyOtp call so we don't leak via latency.
      // Cheap-and-dirty: just call verifyOtp on a fake user id.
      await verifyOtp("__non_existent__", parsed.data.otp).catch(() => {});
      return NextResponse.json(GENERIC_FAILURE, { status: 400 });
    }

    const result = await verifyOtp(user.id, parsed.data.otp);
    if (!result.ok) {
      return NextResponse.json(
        result.locked
          ? { success: false, error: "Too many wrong attempts. Request a new code." }
          : GENERIC_FAILURE,
        { status: 400 },
      );
    }

    const resetToken = generateResetToken();
    await storeResetToken(resetToken, user.id);

    return NextResponse.json({
      success: true,
      resetToken,
      expiresInSeconds: RESET_TOKEN_TTL_SECONDS,
    });
  } catch (error: unknown) {
    console.error("[verify-otp] failed:", error);
    return NextResponse.json(GENERIC_FAILURE, { status: 400 });
  }
}

export const POST = withCors(postHandler);
export function OPTIONS(req: NextRequest) {
  return preflight(req);
}
