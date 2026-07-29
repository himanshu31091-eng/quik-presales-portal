import { db } from "@quikit/database";
import { getServerSession } from "next-auth";
import { type NextAuthOptions } from "next-auth";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { getOrSet } from "./cache";

export interface GetOrgIdConfig {
  appSlug?: string;
}

/**
 * Resolves the active orgId for a user.
 *
 * Hot path on every authenticated API call. NextAuth's JWT already carries
 * `session.user.orgId`, but we also defensively re-validate that the
 * membership row is still active (and, if config.appSlug is set, that the
 * user has UserAppAccess for that app). Both lookups are cached for 60s
 * to keep the per-request overhead at ~zero.
 *
 * Cache TTL is intentionally short so revoking access propagates within
 * a minute. For instant revocation, call `invalidate(...)` from the
 * mutation that toggles status.
 */
export function createGetOrgId(authOptions: NextAuthOptions, config: GetOrgIdConfig = {}) {
  return async function getOrgId(userId: string): Promise<string | null> {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.orgId;
    const isAdminTier =
      session?.user?.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session?.user?.membershipRole ?? ""));

    if (orgId) {
      // Cache the membership re-validation. Stale cached "active" for up to
      // 60s after admin deactivates is acceptable — we trust the JWT for the
      // identity claim and just sanity-check the row exists & is active.
      const ok = await getOrSet<boolean>(
        `membership:${userId}:${orgId}`,
        60,
        async () => {
          const membership = await db.orgMember.findFirst({
            where: { userId, orgId, status: "active" },
            select: { id: true },
          });
          return !!membership;
        },
      );
      if (!ok) return null;

      // Per-app access gate (only when caller passed appSlug). Mirrors the
      // launcher's visibility model (apps/quikit/app/api/apps/launcher) so the
      // API guard and the tile grid agree on who can use an app:
      //   1. The app must be enabled for the org (OrgAppAccess.enabled) and,
      //      if it's on a per-app trial, the trial must not have expired.
      //   2. Org admins / super admins see every provisioned app — no per-user
      //      grant required.
      //   3. Non-admin members additionally need an explicit UserAppAccess row
      //      (FR-OA-002 / FR-OA-003).
      // Self-serve registration provisions access at the org level only
      // (OrgAppAccess), so gating on UserAppAccess alone locked org admins out
      // of every app they had activated.
      if (config.appSlug) {
        const hasAccess = await getOrSet<boolean>(
          `appAccess:${userId}:${orgId}:${config.appSlug}`,
          60,
          async () => {
            const app = await db.app.findUnique({ where: { slug: config.appSlug }, select: { id: true } });
            if (!app) return true; // unknown app → don't block; upstream will 404

            const orgAccess = await db.orgAppAccess.findUnique({
              where: { orgId_appId: { orgId, appId: app.id } },
              select: { enabled: true, trialEndsAt: true },
            });
            if (!orgAccess || !orgAccess.enabled) return false;
            // trialEndsAt: null = no trial / upgraded / grandfathered → active;
            // a past date = expired trial → revoke access.
            if (orgAccess.trialEndsAt && orgAccess.trialEndsAt.getTime() <= Date.now()) return false;

            if (isAdminTier) return true;

            const access = await db.userAppAccess.findUnique({
              where: { userId_orgId_appId: { userId, orgId, appId: app.id } },
              select: { id: true },
            });
            return !!access;
          },
        );
        if (!hasAccess) return null;
      }

      return orgId;
    }

    // No tenant on session yet — pick the user's first active membership
    // (used during initial onboarding, before org selection). Cached for
    // 60s; rare path.
    return await getOrSet<string | null>(
      `firstActiveTenant:${userId}`,
      60,
      async () => {
        // Most recent, matching the sign-in auto-select in `index.ts`. Ordering
        // these two differently is how a freshly-invited user could be resolved
        // into one org by the session and a different one by a request.
        const membership = await db.orgMember.findFirst({
          where: { userId, status: "active" },
          orderBy: { createdAt: "desc" },
          select: { orgId: true },
        });
        return membership?.orgId ?? null;
      },
    );
  };
}

// Backwards-compat alias for app code that hasn't migrated to createGetOrgId
// yet. Prefer createGetOrgId in new code; this alias is part of the v4
// rename (tenantId → orgId) and will be removed in a future cleanup.
export type GetTenantIdConfig = GetOrgIdConfig;
export const createGetTenantId = createGetOrgId;
