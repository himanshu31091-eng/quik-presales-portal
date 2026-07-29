import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const APP_SLUG = "quikpresales";

/**
 * GET /api/session/validate
 *
 * Polled by `<SessionGuard />` to detect access revoked *after* sign-in. The
 * JWT is valid for its whole lifetime, so without this a deactivated user (or
 * a suspended org) keeps working until the token expires.
 *
 * Each `reason` routes the client somewhere different, so they are distinct
 * rather than a single `false`:
 *   unauthenticated    → no session at all
 *   deactivated        → membership revoked
 *   org_suspended      → the whole org was suspended by a super admin
 *   app_access_revoked → org lost quikpresales (or its trial lapsed)
 *
 * Mirrors apps/quikscale and apps/quikinfra.
 */
export async function GET(request: NextRequest) {
  // 100 checks/min per IP. On limit, report valid — a rate-limited probe must
  // never sign a legitimate user out.
  const rl = await rateLimitAsync({
    routeKey: "session:validate",
    clientKey: getClientIp(request),
    limit: 100,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { valid: true, rateLimited: true },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  // 1. Membership still active, and the org itself still active. Pulled
  //    together so a revoked membership is distinguishable from a suspension.
  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { id: true, org: { select: { status: true } } },
  });
  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }
  if (membership.org.status !== "active") {
    return NextResponse.json({ valid: false, reason: "org_suspended" });
  }

  // 2. Org still entitled to this app. Access is provisioned at ORG level;
  //    admins pass on that alone, non-admins additionally need a UserAppAccess
  //    row. Checking UserAppAccess alone would bounce trial org admins.
  const app = await db.app.findUnique({ where: { slug: APP_SLUG }, select: { id: true } });
  if (app) {
    const orgAccess = await db.orgAppAccess.findUnique({
      where: { orgId_appId: { orgId, appId: app.id } },
      select: { enabled: true, trialEndsAt: true },
    });
    const trialExpired =
      !!orgAccess?.trialEndsAt && orgAccess.trialEndsAt.getTime() <= Date.now();
    if (!orgAccess || !orgAccess.enabled || trialExpired) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }

    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));

    if (!isAdminTier) {
      const appAccess = await db.userAppAccess.findUnique({
        where: { userId_orgId_appId: { userId: session.user.id, orgId, appId: app.id } },
        select: { id: true },
      });
      if (!appAccess) {
        return NextResponse.json({ valid: false, reason: "app_access_revoked" });
      }
    }
  }

  return NextResponse.json({ valid: true });
}
