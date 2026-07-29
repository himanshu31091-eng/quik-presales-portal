/**
 * FF-1 feature gate helpers — L3 enforcement for per-tenant module flags.
 *
 * Three shapes of gate:
 *   1. `getDisabledModules(orgId, appSlug)` — raw query, request-deduped
 *      via React.cache. Use when you need the set for rendering (sidebar).
 *   2. `gateModuleRoute(appSlug, moduleKey, authOptions)` — call inside a
 *      server-component layout.tsx. Redirects to /dashboard if disabled.
 *   3. `gateModuleApi(appSlug, moduleKey, orgId)` — call at the top of a
 *      route handler. Returns a `Response` (404) if disabled, or null.
 *
 * The cascade rule ("parent disabled ⇒ children disabled") is applied by
 * `@quikit/shared/moduleRegistry`'s `isModuleEnabled`; this module just
 * plumbs the data and response paths.
 *
 * See docs/plans/FF-1-app-feature-flags.md.
 */

import * as React from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { db } from "@quikit/database";
import { isModuleEnabled, globallyDisabledModules, computeDisabledModules } from "@quikit/shared/moduleRegistry";
import { getOrSet, invalidate } from "./cache";

/**
 * React.cache() is only available in React 18 Canary / React 19 (which Next.js
 * bundles in server components). When running under Vitest (plain React 18.2),
 * it's undefined — fall back to an identity wrapper so the module imports cleanly.
 * The per-request dedup benefit is lost in tests, but correctness is preserved.
 */
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).cache ?? ((fn) => fn);

/**
 * Returns the set of moduleKeys that are EXPLICITLY disabled for the given
 * (orgId, appSlug) pair. Absence of a key means the module is enabled
 * (sparse storage — the default).
 *
 * Deduped per-request via React.cache — sidebar + layout gates + page
 * components all share the same result within a single render pass.
 */
export const getDisabledModules = cache(
  async (orgId: string, appSlug: string): Promise<Set<string>> => {
    // `defaultDisabled` modules (e.g. Cash, Survey) are off for every org —
    // including brand-new ones — unless a per-tenant row explicitly enables
    // them. `computeDisabledModules` reconciles those defaults with the rows.
    try {
      // Disabled modules rarely change (admin toggles them in Settings →
      // Configurations). 30s TTL keeps the FF gate fast without making a
      // disable take "minutes" to roll out across instances.
      const arr = await getOrSet<string[]>(
        `disabledModules:${orgId}:${appSlug}`,
        30,
        async () => {
          const app = await db.app.findUnique({
            where: { slug: appSlug },
            select: { id: true },
          });
          if (!app) return Array.from(globallyDisabledModules(appSlug));
          const rows = await db.appModuleFlag.findMany({
            where: { orgId, appId: app.id },
            select: { moduleKey: true, enabled: true },
          });
          return Array.from(
            computeDisabledModules(appSlug, Array.isArray(rows) ? rows : []),
          );
        },
      );
      return new Set(arr);
    } catch {
      // Fail-open: if the gate query itself errors, don't block the app — treat
      // per-tenant flags as unknown. Registry default-off modules stay off even
      // on a DB glitch (no override known).
      return new Set(globallyDisabledModules(appSlug));
    }
  },
);

/**
 * Drop the cached disabled-module set for one (orgId, appSlug). Call from the
 * super-admin feature-flag toggle route after writing an AppModuleFlag so the
 * change propagates to every process within seconds (the cache's pub/sub
 * channel clears peer in-memory copies) instead of waiting out the 30s TTL.
 *
 * The key string is derived here so it can never drift from the one
 * `getDisabledModules` reads/writes above.
 */
export async function invalidateDisabledModules(
  orgId: string,
  appSlug: string,
): Promise<void> {
  await invalidate(`disabledModules:${orgId}:${appSlug}`);
}

/**
 * Server-component gate. Call from a `layout.tsx` at the top of the module's
 * route subtree. Redirects to /dashboard with a `?feature_disabled=<key>`
 * query param when the module (or any ancestor) is disabled for the caller's
 * tenant. Also redirects to the launcher /apps if the caller has no active
 * tenant (org selection lives on the launcher, not a per-app page).
 *
 * Usage:
 *   // apps/quikscale/app/(dashboard)/kpi/layout.tsx
 *   import { gateModuleRoute } from "@quikit/auth/feature-gate";
 *   import { authOptions } from "@/lib/auth";
 *   export default async function KPILayout({ children }) {
 *     await gateModuleRoute("quikscale", "kpi", authOptions);
 *     return <>{children}</>;
 *   }
 */
export async function gateModuleRoute(
  appSlug: string,
  moduleKey: string,
  authOptions: NextAuthOptions,
): Promise<void> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.orgId;
  if (!orgId) {
    const launcher = (process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
    redirect(launcher ? `${launcher}/apps` : "/apps");
  }
  const disabled = await getDisabledModules(orgId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    redirect(`/dashboard?feature_disabled=${encodeURIComponent(moduleKey)}`);
  }
}

/**
 * API route gate. Call after you've verified the session and resolved the
 * orgId; returns a 404 `NextResponse` if the module is disabled, or
 * `null` to let you continue.
 *
 * Usage:
 *   // apps/quikscale/app/api/kpi/route.ts
 *   const session = await getServerSession(authOptions);
 *   if (!session?.user?.orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
 *   const blocked = await gateModuleApi("quikscale", "kpi", session.user.orgId);
 *   if (blocked) return blocked;
 *   // ... rest of handler ...
 */
export async function gateModuleApi(
  appSlug: string,
  moduleKey: string,
  orgId: string,
): Promise<Response | null> {
  // SA-A.6: hard gate check runs FIRST. If the tenant's app access is revoked,
  // no module-level logic matters.
  const appBlocked = await isTenantAppBlocked(orgId, appSlug);
  if (appBlocked) {
    return NextResponse.json(
      { success: false, error: "App access blocked for this tenant" },
      { status: 403 },
    );
  }
  const disabled = await getDisabledModules(orgId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * SA-A.6 — Tenant-App hard gate
 *
 * Super admins can revoke an entire app for a tenant via the TenantAppAccess
 * table (e.g. "trial expired", "plan downgraded", "payment failed"). This
 * gate is evaluated BEFORE the module-level FF-1 gates, so a revoked app
 * returns a 403 / redirect even when some modules are nominally enabled.
 *
 * Sparse storage: a row exists in TenantAppAccess only when the super admin
 * has explicitly toggled access off. Absence of a row = access granted.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * True if the (orgId, appSlug) pair has been explicitly blocked by a super
 * admin. Request-deduped via React.cache so a single render / handler pass
 * hits the DB at most once.
 */
export const isTenantAppBlocked = cache(
  async (orgId: string, appSlug: string): Promise<boolean> => {
    try {
      // SA-A.6 hard gate — toggled by super admins, super rare. 60s TTL is fine.
      return await getOrSet<boolean>(
        `tenantAppBlocked:${orgId}:${appSlug}`,
        60,
        async () => {
          const app = await db.app.findUnique({
            where: { slug: appSlug },
            select: { id: true },
          });
          if (!app) return false;
          const access = await db.orgAppAccess.findUnique({
            where: { orgId_appId: { orgId, appId: app.id } },
            select: { enabled: true },
          });
          if (!access) return false;
          return access.enabled === false;
        },
      );
    } catch {
      // Fail-open: if the gate query errors, don't lock users out of the app.
      // Security posture: we trust this is a platform-wide administrative
      // gate, not a per-user authorization check — the cost of erring open
      // is "user sees app they should have been blocked from for N minutes"
      // which the super admin can fix; the cost of erring closed is
      // "entire tenant is locked out of the app on a transient DB glitch".
      return false;
    }
  },
);

/**
 * Route-level hard gate. Call from a server layout at the top of an app's
 * authenticated section. Redirects to the launcher with a reason query
 * param when the tenant's app access is revoked.
 *
 * Usage:
 *   // apps/quikscale/app/(dashboard)/layout.tsx
 *   await gateTenantAppRoute("quikscale", authOptions);
 */
export async function gateTenantAppRoute(
  appSlug: string,
  authOptions: NextAuthOptions,
): Promise<void> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.orgId;
  if (!orgId) {
    const launcher = (process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
    redirect(launcher ? `${launcher}/apps` : "/apps");
  }
  const blocked = await isTenantAppBlocked(orgId, appSlug);
  if (blocked) {
    // Bounce back to the launcher's apps page with a flag so it can render
    // a "you no longer have access" notice.
    const launcher = process.env.QUIKIT_URL ?? "/";
    const target = `${launcher.replace(/\/+$/, "")}/apps?blocked=${encodeURIComponent(appSlug)}`;
    redirect(target);
  }
}
