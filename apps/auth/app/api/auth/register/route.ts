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
  REGISTRATION_OTP_TTL_SECONDS,
} from "@/lib/otp-store";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";

/**
 * POST /api/auth/register — STEP 1 of self-serve workspace creation.
 *
 * Collects name + email + org name (NO password yet). Creates an unverified,
 * password-less User row in Postgres, stashes the pending org name + a 6-digit
 * OTP in Redis (5-min TTL), and emails the code. The org/membership/trial
 * subscription are NOT created until the user verifies the OTP and sets a
 * password (POST /api/auth/register/complete) — so an abandoned sign-up never
 * leaves an orphan Org/Subscription behind.
 *
 * The invite-based /api/auth/signup flow is unrelated and untouched.
 */
const Body = z
  .object({
    fullName: z.string().trim().min(1).max(160).optional(),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().toLowerCase().email(),
    organizationName: z.string().trim().min(2).max(120),
  })
  .refine((d) => Boolean(d.fullName) || (Boolean(d.firstName) && Boolean(d.lastName)), {
    message: "Provide either a full name or both first and last name.",
  });

function splitName(d: z.infer<typeof Body>): { firstName: string; lastName: string } {
  if (d.firstName && d.lastName) return { firstName: d.firstName, lastName: d.lastName };
  const parts = (d.fullName ?? "").trim().split(/\s+/);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName };
}

const FAIL_CLOSED = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    // Per-IP throttle (account-creation + email-send abuse guard).
    const ipRl = await rateLimitAsync({
      routeKey: "auth:register:ip",
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

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    const data = parsed.data;
    const { email, organizationName } = data;
    const { firstName, lastName } = splitName(data);

    // Per-email throttle.
    const emailRl = await rateLimitAsync({
      routeKey: "auth:register:email",
      clientKey: email,
      limit: 5,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests for this email. Try again later." },
        { status: 429, headers: { "retry-after": String(emailRl.retryAfterSeconds) } },
      );
    }

    // An account is "complete" once it has a password, a verified email, or any
    // org membership (covers OAuth users too). Those must sign in, not re-register.
    const existing = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        emailVerified: true,
        _count: { select: { memberships: true } },
      },
    });
    if (existing && (existing.password || existing.emailVerified || existing._count.memberships > 0)) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists. Please sign in." },
        { status: 409 },
      );
    }

    // Create or reuse the unverified, password-less user (idempotent retry:
    // an abandoned sign-up with the same email just refreshes name + OTP).
    let userId: string;
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { firstName, lastName } });
      userId = existing.id;
    } else {
      const user = await db.user.create({
        data: { email, firstName, lastName, password: null, emailVerified: null },
      });
      userId = user.id;
    }

    // Stash the pending workspace + issue the OTP (both in Redis).
    await storePendingRegistration(userId, { organizationName });
    const otp = generateOtp();
    await storeOtp(userId, hashOtp(otp), REGISTRATION_OTP_TTL_SECONDS);

    try {
      await sendRegistrationOtpEmail({ to: email, otp });
    } catch (err) {
      console.error("[register] OTP email send failed:", err);
    }

    return NextResponse.json(
      { success: true, email, expiresInSeconds: REGISTRATION_OTP_TTL_SECONDS },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
