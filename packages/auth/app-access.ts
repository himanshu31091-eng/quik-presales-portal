import { redirect } from "next/navigation";
import { db } from "@quikit/database";
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from "@quikit/shared";

/**
 * Server-side app-access check — the SINGLE source of truth for "can this user
 * open this app", mirroring the launcher/switcher visibility rule
 * (apps/quikit/app/api/apps/launcher/route.ts) and the per-app
 * /api/session/validate gate:
 *
 *   1. The org must have OrgAppAccess.enabled = true for the app.
 *   2. A `requiresOrgAdmin` app additionally needs an admin-tier caller.
 *   3. Org admins / super admins pass on org-level access alone; everyone else
 *      needs an explicit UserAppAccess row.
 *   4. An expired per-app trial revokes access to THAT app (matches
 *      session/validate) — but a trialing/expired app still counts as a
 *      "reachable" launcher tile for the `otherAppsCount`, matching the
 *      launcher, so "Go to my apps" stays offered.
 *
 * Returns whether the user may open `appSlug`, plus how many OTHER apps they can
 * reach (used to decide the access-denied popup's "Go to my apps" button).
 */
export interface AppAccessResult {
  hasAccess: boolean;
  otherAppsCount: number;
}

export async function getAppAccess(params: {
  userId: string;
  orgId: string;
  appSlug: string;
  isSuperAdmin: boolean;
  memberRole?: string | null;
}): Promise<AppAccessResult> {
  const { userId, orgId, appSlug, isSuperAdmin, memberRole } = params;
  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  const [thisApp, allApps, orgAllows, userAccess] = await Promise.all([
    db.app.findUnique({ where: { slug: appSlug }, select: { id: true, requiresOrgAdmin: true } }),
    db.app.findMany({
      where: { status: { not: "disabled" }, slug: { notIn: ["quikit", ...HIDDEN_APP_SLUGS] } },
      select: { id: true, requiresOrgAdmin: true },
    }),
    db.orgAppAccess.findMany({
      where: { orgId, enabled: true },
      select: { appId: true, trialEndsAt: true },
    }),
    db.userAppAccess.findMany({ where: { userId, orgId }, select: { appId: true } }),
  ]);

  const orgTrial = new Map(orgAllows.map((a) => [a.appId, a.trialEndsAt]));
  const orgAllowedIds = new Set(orgAllows.map((a) => a.appId));
  const userAppIds = new Set(userAccess.map((u) => u.appId));

  // Launcher visibility rule (no trial filter — expired-trial apps still show).
  function isVisible(appId: string, requiresOrgAdmin: boolean): boolean {
    if (!orgAllowedIds.has(appId)) return false;
    if (requiresOrgAdmin && !memberIsAdmin) return false;
    if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(appId)) return false;
    return true;
  }
  function trialExpired(appId: string): boolean {
    const t = orgTrial.get(appId) ?? null;
    return !!t && t.getTime() <= Date.now();
  }

  // Unregistered app (no App row / no client link) → don't block (matches the
  // authorize endpoint's `if (app)` guard).
  const hasAccess = thisApp
    ? isVisible(thisApp.id, thisApp.requiresOrgAdmin) && !trialExpired(thisApp.id)
    : true;

  const otherAppsCount = allApps.filter(
    (a) => a.id !== thisApp?.id && isVisible(a.id, a.requiresOrgAdmin),
  ).length;

  return { hasAccess, otherAppsCount };
}

/**
 * Server Component guard. Call at the top of a protected (dashboard) layout —
 * BEFORE any protected UI renders — so an unauthorized user is redirected to
 * the app's landing page with the access-denied popup markers, and the
 * dashboard never paints (not even for a frame).
 *
 * No-ops when the caller isn't fully authenticated (no user / no selected org);
 * middleware + the other guards own those cases. `redirect()` throws
 * NEXT_REDIRECT, which Next.js turns into a real redirect — let it propagate.
 */
export async function requireAppAccess(opts: {
  userId?: string | null;
  orgId?: string | null;
  appSlug: string;
  isSuperAdmin?: boolean;
  memberRole?: string | null;
  /** Launcher origin passed to the popup so "Go to my apps" resolves. */
  homeUrl?: string;
}): Promise<void> {
  if (!opts.userId || !opts.orgId) return;

  const { hasAccess, otherAppsCount } = await getAppAccess({
    userId: opts.userId,
    orgId: opts.orgId,
    appSlug: opts.appSlug,
    isSuperAdmin: opts.isSuperAdmin === true,
    memberRole: opts.memberRole,
  });
  if (hasAccess) return;

  const params = new URLSearchParams({
    reason: "no_app_access",
    others: String(otherAppsCount),
  });
  if (opts.homeUrl) params.set("home", opts.homeUrl.replace(/\/+$/, ""));
  redirect(`/?${params.toString()}`);
}
