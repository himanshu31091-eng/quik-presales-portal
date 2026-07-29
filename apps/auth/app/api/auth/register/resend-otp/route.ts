import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendRegistrationOtpEmail } from "@/lib/email";
import {
  generateOtp,
  hashOtp,
  storeOtp,
  storePendingRegistration,
  peekPendingRegistration,
  REGISTRATION_OTP_TTL_SECONDS,
} from "@/lib/otp-store";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";

/**
 * POST /api/auth/register/resend-otp
 *
 * Body: { email }
 *
 * Regenerates the 6-digit registration OTP for an in-progress (unverified)
 * sign-up and re-emails it, refreshing the 5-minute window. Always returns
 * success (anti-enumeration). Rate-limited per IP + per email.
 */
const Body = z.object({ email: z.string().trim().toLowerCase().email() });

const FAIL_CLOSED = process.env.NODE_ENV === "production";
const SUCCESS = { success: true as const, expiresInSeconds: REGISTRATION_OTP_TTL_SECONDS };

export async function POST(req: NextRequest) {
  try {
    const ipRl = await rateLimitAsync({
      routeKey: "auth:register-resend:ip",
      clientKey: getClientIp(req),
      limit: 10,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!ipRl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again later." },
        { status: 429, headers: { "retry-after": String(ipRl.retryAfterSeconds) } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json(SUCCESS);
    const { email } = parsed.data;

    const emailRl = await rateLimitAsync({
      routeKey: "auth:register-resend:email",
      clientKey: email,
      limit: 4,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRl.ok) return NextResponse.json(SUCCESS); // silent — anti-enumeration

    // Only resend for an in-progress sign-up (unverified, password-less, no org).
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        emailVerified: true,
        _count: { select: { memberships: true } },
      },
    });
    if (
      user &&
      !user.password &&
      !user.emailVerified &&
      user._count.memberships === 0
    ) {
      // Keep the pending org context alive (refresh its TTL if still present).
      const pending = await peekPendingRegistration(user.id);
      if (pending) await storePendingRegistration(user.id, pending);
      const otp = generateOtp();
      await storeOtp(user.id, hashOtp(otp), REGISTRATION_OTP_TTL_SECONDS);
      try {
        await sendRegistrationOtpEmail({ to: email, otp });
      } catch (err) {
        console.error("[register/resend-otp] email send failed:", err);
      }
    }

    return NextResponse.json(SUCCESS);
  } catch (error: unknown) {
    console.error("[register/resend-otp] failed:", error);
    return NextResponse.json(SUCCESS);
  }
}
