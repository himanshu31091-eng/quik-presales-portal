import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendOnboardingInvitationEmail } from "@/lib/email";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { INVITE_METHOD } from "@quikit/shared";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { getRedis } from "@quikit/redis";

/**
 * POST /api/auth/forgot-password  (same-origin to the launcher)
 *
 * The marketing LoginModal calls this when the user clicks "Send code" on
 * the Reset-password screen. Identical contract to the auth service's
 * /api/auth/forgot-password — kept here so the modal doesn't have to make a
 * cross-origin request (no CORS, no env-var, no NextAuth catch-all
 * collision).
 *
 * Flow:
 *   1. Reset the user's `password` to bcrypt(generateTempPassword()) and
 *      flip `mustChangePassword = true`.
 *   2. Mint a single-use token on the user's primary OrgMember row
 *      (`invitationToken` + `invitedAt`). Status is left unchanged so an
 *      already-active member doesn't lose org access while the link is
 *      outstanding.
 *   3. Record the issuance in Redis (`password-reset:issued:<userId>` with
 *      7-day TTL) for audit/throttling. Best-effort; never blocks the
 *      response.
 *   4. Email the same Native-Invite template the user got the first time
 *      they were onboarded (email + temporary password + Set-Up link) via
 *      `sendOnboardingInvitationEmail`. The link points back at this same
 *      launcher (`/invitations/accept?token=…`), which the LoginModal
 *      already handles by opening the "Set your password" view.
 *
 * Anti-enumeration: the response is always `{ success: true }` whether the
 * email maps to a real user or not. Errors are logged server-side.
 */

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const FAIL_CLOSED = process.env.NODE_ENV === "production";
const RESET_FLAG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — matches invitation TTL.

export async function POST(req: NextRequest) {
  const successPayload = { success: true };

  try {
    let parsed: { email: string } | null = null;
    try {
      const result = Body.safeParse(await req.json());
      if (result.success) parsed = result.data;
    } catch {
      // Silent-success on malformed body to preserve anti-enumeration.
    }
    if (!parsed) {
      return NextResponse.json(successPayload);
    }

    const ipRl = await rateLimitAsync({
      routeKey: "auth:forgot-password:ip",
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

    const emailRl = await rateLimitAsync({
      routeKey: "auth:forgot-password:email",
      clientKey: parsed.email,
      limit: 3,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRl.ok) {
      return NextResponse.json(successPayload);
    }

    const user = await db.user.findUnique({
      where: { email: parsed.email },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) {
      return NextResponse.json(successPayload);
    }

    // Pick a "primary" org membership to attach the single-use token to.
    // Prefer the most recently updated active one; fall back to the most
    // recent of any status. If the user has zero memberships there's
    // nowhere to land the accept link — silent-success and bail.
    const membership =
      (await db.orgMember.findFirst({
        where: { userId: user.id, status: "active" },
        orderBy: { updatedAt: "desc" },
        include: {
          org: { select: { name: true, logoUrl: true, brandColor: true } },
        },
      })) ??
      (await db.orgMember.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          org: { select: { name: true, logoUrl: true, brandColor: true } },
        },
      }));
    if (!membership) {
      console.warn(
        "[forgot-password] user has no OrgMember rows, skipping:",
        user.email,
      );
      return NextResponse.json(successPayload);
    }

    const token = crypto.randomBytes(24).toString("hex");
    const tempPassword = generateTempPassword();
    const hashedDefault = await bcrypt.hash(tempPassword, 10);

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { password: hashedDefault, mustChangePassword: true },
      }),
      db.orgMember.update({
        where: { id: membership.id },
        data: {
          invitationToken: token,
          invitedAt: new Date(),
          inviteMethod: INVITE_METHOD.NATIVE,
        },
      }),
    ]);

    try {
      const r = getRedis();
      if (r) {
        await r.set(
          `password-reset:issued:${user.id}`,
          JSON.stringify({
            membershipId: membership.id,
            issuedAt: Date.now(),
            ip: getClientIp(req),
          }),
          "EX",
          RESET_FLAG_TTL_SECONDS,
        );
      }
    } catch (err) {
      console.error("[forgot-password] redis flag write failed:", err);
    }

    try {
      await sendOnboardingInvitationEmail({
        to: user.email,
        firstName: user.firstName || user.email.split("@")[0] || "there",
        orgName: membership.org.name,
        orgLogoUrl: membership.org.logoUrl,
        orgBrandColor: membership.org.brandColor,
        inviterName: "QuikIT Support",
        role: membership.role,
        appNames: [],
        token,
        inviteMethod: INVITE_METHOD.NATIVE,
        isReminder: true,
        tempPassword,
      });
    } catch (err) {
      console.error("[forgot-password] email send failed:", err);
    }

    return NextResponse.json(successPayload);
  } catch (error: unknown) {
    console.error("[forgot-password] unexpected error:", error);
    return NextResponse.json(successPayload);
  }
}
