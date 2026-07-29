import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendPasswordResetInviteEmail } from "@/lib/email";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import {
  INVITE_METHOD,
  renderInvitationEmail,
  requireProdEnv,
} from "@quikit/shared";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { getRedis } from "@quikit/redis";
import { withCors, preflight } from "@/lib/cors";

/**
 * POST /api/auth/forgot-password
 *
 * Self-service password reset. We do NOT email an OTP — instead we treat the
 * request as a forced re-invite:
 *
 *   1. Reset the user's `password` to bcrypt(generateTempPassword()) and
 *      flip `mustChangePassword = true`.
 *   2. Mint a fresh single-use token on the user's primary OrgMember row
 *      (`invitationToken` + `invitedAt`). Status is left unchanged so an
 *      already-active member doesn't lose org access while the link is
 *      outstanding.
 *   3. Record the issuance in Redis (`password-reset:issued:<userId>` with
 *      7-day TTL) so future tooling can audit/throttle without scanning the
 *      DB. Redis is best-effort — failures are logged, not surfaced.
 *   4. Email the user their email + the default password + a link to
 *      `${launcherBase}/invitations/accept?token=…`. That URL opens the
 *      marketing LoginModal's "Set your password" view, identical to the
 *      first-time native-invite flow.
 *
 * Anti-enumeration: the response is always `{ success: true }` whether the
 * email maps to a real user or not, so an attacker can't probe the user
 * table by inspecting the response. Errors are logged server-side.
 *
 * Rate-limited per IP and per email — see `rateLimitAsync` below.
 */

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const FAIL_CLOSED = process.env.NODE_ENV === "production";
const RESET_FLAG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — matches invitation TTL.

function launcherBase(): string {
  // Env-only — no hardcoded prod URL. Falls back to the local launcher in
  // dev; prod throws if neither var is set so we never accidentally email
  // a Vercel-preview link.
  const raw =
    process.env.NEXT_PUBLIC_LAUNCHER_URL ??
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    requireProdEnv("NEXT_PUBLIC_LAUNCHER_URL", "http://localhost:3001");
  return raw.replace(/\/+$/, "");
}

async function postHandler(req: NextRequest) {
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

    // Per-IP throttle first (cheaper, before DB hit).
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

    // Per-email throttle: stops an attacker from spamming a known user's inbox.
    const emailRl = await rateLimitAsync({
      routeKey: "auth:forgot-password:email",
      clientKey: parsed.email,
      limit: 3,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRl.ok) {
      // Silent success — see anti-enumeration note in the docblock.
      return NextResponse.json(successPayload);
    }

    const user = await db.user.findUnique({
      where: { email: parsed.email },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) {
      return NextResponse.json(successPayload);
    }

    // Pick a "primary" org membership to attach the single-use token to. We
    // prefer the most recently updated active one; if none are active we
    // fall back to the most recent row of any status (covers the edge case
    // where every membership is still pending). If the user has zero
    // memberships there's nowhere to land the accept link — silent-success
    // and bail.
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

    // Single transaction so we never end up with a token pointing at an
    // OrgMember whose owning User still has the old password.
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
          // Reset the invite method to native so the accept screen prompts
          // for the default password (matches the first-time flow).
          inviteMethod: INVITE_METHOD.NATIVE,
        },
      }),
    ]);

    // Redis flag for auditing / future "you have a reset in flight" UI.
    // Best-effort — never block the response on Redis.
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

    // Build the same email body the first-time native invite uses. The
    // template already prints email + temporary password + Set-Up link, so
    // the user lands on the LoginModal's "Set your password" view with a
    // valid current-password to type in.
    const { subject, html } = renderInvitationEmail({
      to: user.email,
      firstName: user.firstName || user.email.split("@")[0] || "there",
      orgName: membership.org.name,
      orgLogoUrl: membership.org.logoUrl,
      orgBrandColor: membership.org.brandColor,
      inviterName: "QuikIT Support",
      role: membership.role,
      appNames: [],
      token,
      appBaseUrl: launcherBase(),
      inviteMethod: INVITE_METHOD.NATIVE,
      isReminder: true,
      tempPassword,
    });

    try {
      await sendPasswordResetInviteEmail({ to: user.email, subject, html });
    } catch (err) {
      console.error("[forgot-password] email send failed:", err);
    }

    return NextResponse.json(successPayload);
  } catch (error: unknown) {
    console.error("[forgot-password] unexpected error:", error);
    return NextResponse.json(successPayload);
  }
}

export const POST = withCors(postHandler);
export function OPTIONS(req: NextRequest) {
  return preflight(req);
}
