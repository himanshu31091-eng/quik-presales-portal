/**
 * Server-side permission gate for QuikPreSales Roles & Permissions v2.
 *
 * Storage (all inside `app_quikpresales`, scoped by this app's `App.id`):
 *   - roles                          → PsAppRole            ("AppRole")
 *   - user → role mapping            → PsUserAppRole        ("UserAppRole")
 *   - role grants (resource, action) → PsRolePermission     ("RolePermission")
 *   - sidebar grants (navKey)        → PsRoleNavigation     ("RoleNavigation")
 *   - per-user additive grants       → PsUserPermissionExtra("UserPermissionExtra")
 *
 * The physical names are what `packages/auth/assign-app-roles.ts` looks for
 * when it mirrors a role name onto `quikit.UserAppAccess.role`. That file is
 * generic and needs no change for this app.
 *
 * Effective permission = role grants UNION per-user extras — the same
 * resolution quiktrack and quikscale use.
 *
 * Decision order in `userCan`:
 *   1. org-tier admin (OrgMember.role ∈ ADMIN_TIER_ROLES, or "owner") → allow
 *   2. app admin — holds the `admin` role (isSystem)                  → allow
 *   3. a PsRolePermission grant on one of the user's roles            → allow
 *   4. a PsUserPermissionExtra row for this user                      → allow
 *   5. otherwise                                                      → deny
 *
 * Usage — first line of every mutating handler:
 *   const denied = await requirePermission(userId, orgId, "engagements", "create");
 *   if (denied) return denied;
 */
import { NextResponse } from "next/server";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { db } from "@/lib/db";
import {
  APP_ADMIN_ROLE_NAME,
  DEFAULT_ROLES,
  NAV_KEYS,
  NAV_TO_ENTITY,
  allPermissionPairs,
  isAction,
  isNavKey,
  isResource,
  type Action,
  type Resource,
} from "@/lib/api/permissionsRegistry";

export const QUIKPRESALES_APP_SLUG = "quikpresales";

/**
 * App.id lookup, memoised for the life of the process. The App row is created
 * once via the super-admin App Registry and never changes id, so caching a hit
 * is safe. A miss is not cached — the row may appear after first boot.
 */
let cachedAppId: string | null = null;

export async function getQuikPreSalesAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKPRESALES_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/** 403 response body used by every denied check. */
export function forbidden(message = "You do not have permission to perform this action") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

/**
 * True when the user holds this app's admin role for the org.
 *
 * Matches on `{ isSystem: true, name: "admin" }` — byte-identical to
 * `isQuikTrackAppAdmin`. Distinct from the central `OrgMember.role` tier: an
 * app admin is an admin *of this app*, not of the organization.
 */
export async function isPreSalesAppAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikPreSalesAppId();
  if (!appId) return false;
  const hit = await db.psUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: APP_ADMIN_ROLE_NAME } },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Protected-row guard for the roles API (rename/delete). NOT a permission
 * bypass — the admin role's grants stay editable like any other role's.
 */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === APP_ADMIN_ROLE_NAME;
}

/**
 * Unified admin predicate: org-tier admin OR this app's admin role.
 *
 * Platform super-admin (`User.isSuperAdmin`) is deliberately not consulted —
 * consumer apps force `session.user.isSuperAdmin = false`, so the in-app
 * equivalent is the `super_admin` membership tier, already inside
 * ADMIN_TIER_ROLES.
 */
export async function hasAdminAccess(userId: string, orgId: string): Promise<boolean> {
  const member = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (member?.role && (ADMIN_TIER_ROLES.has(member.role) || member.role === "owner")) {
    return true;
  }
  return isPreSalesAppAdmin(userId, orgId);
}

/** Class-level permission check. */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  if (await hasAdminAccess(userId, orgId)) return true;

  const appId = await getQuikPreSalesAppId();
  if (!appId) return false;

  const roleHit = await db.psRolePermission.findFirst({
    where: {
      resource,
      action,
      role: { appId, orgId, members: { some: { userId, orgId } } },
    },
    select: { id: true },
  });
  if (roleHit) return true;

  // Per-user additive grant — lets an admin give one person a single extra
  // capability without minting a whole role for them.
  const extraHit = await db.psUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

/**
 * Sidebar visibility. Resolution order mirrors quiktrack:
 *   1. A navKey mapped to a resource is satisfied by `view` on that resource —
 *      no separate nav grant, so the permission matrix stays the single source
 *      of truth and the two can never disagree.
 *   2. Otherwise it's a pure-navigation item and must be granted explicitly in
 *      PsRoleNavigation.
 */
export async function userHasNav(userId: string, orgId: string, navKey: string): Promise<boolean> {
  const mapped = NAV_TO_ENTITY[navKey];
  if (mapped) return userCan(userId, orgId, mapped, "view");

  if (!isNavKey(navKey)) return false;
  if (await hasAdminAccess(userId, orgId)) return true;

  const appId = await getQuikPreSalesAppId();
  if (!appId) return false;

  const hit = await db.psRoleNavigation.findFirst({
    where: { navKey, role: { appId, orgId, members: { some: { userId, orgId } } } },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Guard for route handlers. Returns a 403 NextResponse when the user lacks the
 * permission, or `null` when they hold it.
 */
export async function requirePermission(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<NextResponse | null> {
  const allowed = await userCan(userId, orgId, resource, action);
  return allowed ? null : forbidden();
}

/* ─────────────────────────── Role seeding ──────────────────────────── */

/**
 * Idempotently create this app's roles and grants for an org.
 *
 * Shape matches every other QuikIT app exactly:
 *   - ONE system role literally named `admin` (isSystem: true) holding every
 *     permission pair. This is the row the Admin Portal renders under
 *     "System Roles" — it splits purely on `isSystem`.
 *   - The domain roles as CUSTOM roles (isSystem: false), one of them
 *     `isDefault` — the same arrangement as quiklms's TENANT_ADMIN / LEARNER
 *     or quiktrack's Member / Space Creator.
 *
 * Cheap to call on every authenticated request thanks to the in-process
 * `seededOrgs` guard; the DB writes are find-first / skipDuplicates guarded
 * anyway, so concurrent callers cannot double-insert.
 */
const seededOrgs = new Set<string>();

export interface SeededRoles {
  /** The `admin` system role — what org admins get assigned to. */
  adminRoleId: string;
  /** Role new invitees land on (`sales_exec`). */
  defaultRoleId: string;
}

/**
 * Returns the role ids even on the cached path, because
 * /api/internal/provision-roles needs `adminRoleId` to assign org admins onto
 * it — an early `return` would make a second provisioning call a silent no-op.
 */
export async function seedAllDefaultRoles(orgId: string): Promise<SeededRoles | null> {
  const appId = await getQuikPreSalesAppId();
  if (!appId) {
    // App not registered yet — don't poison the cache; retry next request.
    return null;
  }

  if (seededOrgs.has(orgId)) {
    return lookupSeededRoles(orgId, appId);
  }

  // 1. The single system role. Every pair, derived, so a newly-added resource
  //    is covered without touching the seeder.
  const adminRoleId = await upsertRole(orgId, appId, {
    name: APP_ADMIN_ROLE_NAME,
    description:
      "Full access — auto-seeded. Permissions are editable; rename/delete protected.",
    isSystem: true,
    isDefault: false,
  });
  await grantIfEmpty(adminRoleId, allPermissionPairs());
  await grantNavIfEmpty(adminRoleId, NAV_KEYS);

  // 2. The domain roles, all custom.
  let defaultRoleId = adminRoleId;
  for (const def of DEFAULT_ROLES) {
    const roleId = await upsertRole(orgId, appId, {
      name: def.name,
      description: def.description,
      isSystem: false,
      isDefault: def.isDefault,
    });
    if (def.isDefault) defaultRoleId = roleId;

    const pairs =
      def.grants === null
        ? allPermissionPairs()
        : Object.entries(def.grants).flatMap(([resource, actions]) =>
            (actions ?? []).map((action) => ({
              resource: resource as Resource,
              action: action as Action,
            })),
          );
    await grantIfEmpty(roleId, pairs);
    await grantNavIfEmpty(roleId, def.nav);
  }

  seededOrgs.add(orgId);
  return { adminRoleId, defaultRoleId };
}

async function lookupSeededRoles(orgId: string, appId: string): Promise<SeededRoles | null> {
  const roles = await db.psAppRole.findMany({
    where: { orgId, appId },
    select: { id: true, name: true, isDefault: true },
  });
  const admin = roles.find((r) => r.name === APP_ADMIN_ROLE_NAME);
  if (!admin) return null;
  const fallback = roles.find((r) => r.isDefault) ?? admin;
  return { adminRoleId: admin.id, defaultRoleId: fallback.id };
}

/**
 * Idempotently put a user on a role. Used by the launcher's eager
 * provisioning to place org admins on the `admin` role at grant time, so they
 * aren't locked out waiting for lazy first-request seeding.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
): Promise<void> {
  const existing = await db.psUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.psUserAppRole.create({ data: { userId, orgId, roleId } });
}

async function upsertRole(
  orgId: string,
  appId: string,
  role: { name: string; description: string; isSystem: boolean; isDefault: boolean },
): Promise<string> {
  const existing = await db.psAppRole.findFirst({
    where: { orgId, appId, name: role.name },
    select: { id: true, isSystem: true },
  });

  if (existing) {
    // Self-heal a row seeded before the isSystem convention was applied.
    // Only the seeder's own roles are touched, and only the flag.
    if (existing.isSystem !== role.isSystem) {
      await db.psAppRole.update({
        where: { id: existing.id },
        data: { isSystem: role.isSystem },
      });
    }
    return existing.id;
  }

  const created = await db.psAppRole.create({
    data: {
      orgId,
      appId,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
    },
    select: { id: true },
  });
  return created.id;
}

/** Seed nav grants only when the role has none — same rule as grantIfEmpty. */
async function grantNavIfEmpty(roleId: string, navKeys: readonly string[]): Promise<void> {
  if (navKeys.length === 0) return;
  const count = await db.psRoleNavigation.count({ where: { roleId } });
  if (count > 0) return;

  await db.psRoleNavigation.createMany({
    data: navKeys.map((navKey) => ({ roleId, navKey })),
    skipDuplicates: true,
  });
}

/**
 * Seed grants only when the role has none. Admins who deliberately strip a
 * seeded role back to zero grants would see them restored on next boot; that
 * matches the behaviour of the other apps' seeders and is the safer default
 * (a role with no grants is indistinguishable from a fresh one).
 */
async function grantIfEmpty(
  roleId: string,
  pairs: { resource: Resource; action: Action }[],
): Promise<void> {
  if (pairs.length === 0) return;
  const count = await db.psRolePermission.count({ where: { roleId } });
  if (count > 0) return;

  const role = await db.psAppRole.findUnique({ where: { id: roleId }, select: { orgId: true } });
  if (!role) return;

  await db.psRolePermission.createMany({
    data: pairs.map((p) => ({ orgId: role.orgId, roleId, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

/** Test seam — clears the memoised app id and per-org seed guard. */
export function __resetRbacCaches(): void {
  cachedAppId = null;
  seededOrgs.clear();
}
