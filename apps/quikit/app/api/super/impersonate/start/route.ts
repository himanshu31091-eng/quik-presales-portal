/**
 * SA-D.2 — Start an impersonation session.
 *
 * POST /api/super/impersonate/start
 *   Body: { targetUserId, targetOrgId, targetAppSlug, reason? }
 *
 * Creates an Impersonation row with a single-use token (2h expiry), writes
 * an audit log entry, and returns { redirectUrl } — a deep link to the
 * target app's accept endpoint.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const LANDING_PATH = "/dashboard"; // where the impersonated session starts

// Rate limit: per super-admin account. 10 impersonations per hour is a
// generous cap for legitimate support work; any more strongly suggests a
// compromised account. Fail-closed so an attacker can't exhaust Redis.
const IMPERSONATE_LIMIT = 10;
const IMPERSONATE_WINDOW_MS = 60 * 60 * 1000;

export const POST = withSuperAdminAuth(async (auth, req: NextRequest) => {
  // Tech-debt #8 close — rate-limit per super-admin account.
  const rl = await rateLimitAsync({
    routeKey: "super:impersonate:start",
    clientKey: auth.userId,
    limit: IMPERSONATE_LIMIT,
    windowMs: IMPERSONATE_WINDOW_MS,
    failClosed: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `Impersonation rate limit exceeded (${IMPERSONATE_LIMIT}/hour). Retry in ${rl.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "retry-after": String(rl.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = await req.json();
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : null;
    const targetOrgId = typeof body.targetOrgId === "string" ? body.targetOrgId : null;
    const targetAppSlug = typeof body.targetAppSlug === "string" ? body.targetAppSlug : null;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

    if (!targetUserId || !targetOrgId || !targetAppSlug) {
      return NextResponse.json(
        { success: false, error: "targetUserId, targetOrgId, and targetAppSlug are required" },
        { status: 400 },
      );
    }

    // Validate: target user must have an active membership in the target tenant.
    const membership = await db.orgMember.findFirst({
      where: { userId: targetUserId, orgId: targetOrgId, status: "active" },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        org: { select: { id: true, name: true } },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Target user has no active membership in the target tenant" },
        { status: 404 },
      );
    }

    const app = await db.app.findUnique({
      where: { slug: targetAppSlug },
      select: { id: true, baseUrl: true, name: true, status: true },
    });
    if (!app) {
      return NextResponse.json({ success: false, error: `Unknown app: ${targetAppSlug}` }, { status: 404 });
    }
    if (app.status === "disabled") {
      return NextResponse.json({ success: false, error: `App ${app.name} is disabled` }, { status: 400 });
    }

    // Never allow impersonating another super admin — that would bypass
    // audit integrity and give a power-user-on-power-user escalation path.
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { isSuperAdmin: true, email: true },
    });
    if (targetUser?.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Impersonating another super admin is not allowed" },
        { status: 403 },
      );
    }

    // The app's baseUrl is either an absolute URL or "/" (for the launcher
    // itself, which has no impersonation endpoint). We treat anything but a
    // known absolute URL as a config error — reject BEFORE creating the
    // impersonation row so we don't leave orphan tokens.
    if (!app.baseUrl.startsWith("http")) {
      return NextResponse.json(
        { success: false, error: `App ${app.name} has no absolute baseUrl; cannot redirect for impersonation` },
        { status: 400 },
      );
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const impersonation = await db.impersonation.create({
      data: {
        superAdminId: auth.userId,
        targetUserId,
        targetOrgId,
        targetAppSlug,
        token,
        expiresAt,
        reason,
        ipAddress,
      },
    });

    logAudit({
      orgId: targetOrgId,
      actorId: auth.userId,
      action: "CREATE",
      entityType: "Impersonation",
      entityId: impersonation.id,
      newValues: JSON.stringify({
        targetUserId,
        targetOrgId,
        targetAppSlug,
        targetEmail: targetUser?.email,
        reason,
        expiresAt: expiresAt.toISOString(),
      }),
    });

    const redirectUrl = `${app.baseUrl.replace(/\/+$/, "")}/api/auth/impersonate/${token}?landing=${encodeURIComponent(LANDING_PATH)}`;

    return NextResponse.json({
      success: true,
      data: {
        id: impersonation.id,
        redirectUrl,
        expiresAt: expiresAt.toISOString(),
        target: {
          userEmail: membership.user.email,
          userName: `${membership.user.firstName} ${membership.user.lastName}`.trim(),
          orgName: membership.org.name,
          appName: app.name,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start impersonation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
