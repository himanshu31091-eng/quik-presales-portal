/**
 * Cross-app helper: assign a named AppRole inside each app's per-schema
 * RBAC v2 tables (`app_<slug>.AppRole` / `app_<slug>.UserAppRole`).
 *
 * Used by every invite flow that mints UserAppAccess rows:
 *   - apps/admin/app/api/members/route.ts                (org admin invite)
 *   - apps/quikit/app/api/super/orgs/[id]/members/route.ts (super admin add member)
 *   - apps/auth/app/api/invitations/accept/route.ts        (invitation accept)
 *
 * Apps without RBAC v2 tables in their schema are silently skipped, so this
 * is safe to call for every (user, app) tuple in the invite flow.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const SAFE_SLUG = /^[a-z0-9_-]+$/;

interface RoleAssignment {
  userId: string;
  appId: string;
  /** Optional. Defaults to "Admin" when empty / undefined. */
  roleName?: string;
}

async function appHasRbac(
  db: PrismaClient,
  slug: string,
): Promise<boolean> {
  if (!SAFE_SLUG.test(slug)) return false;
  const schema = `app_${slug}`;
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = ${schema} AND table_name = 'AppRole'
    ) AS "exists";`,
  );
  return Boolean(rows[0]?.exists);
}

async function resolveRoleId(
  db: PrismaClient,
  orgId: string,
  appId: string,
  slug: string,
  roleName: string,
): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "app_${slug}"."AppRole"
      WHERE "orgId" = $1 AND "appId" = $2 AND "name" = $3
      LIMIT 1`,
    orgId, appId, roleName,
  );
  return rows[0]?.id ?? null;
}

/**
 * Assign the named AppRole to each user, REPLACING any role they already hold
 * in that app, and mirror the role name onto the central `quikit.UserAppAccess`
 * row so the Admin Portal reflects it. Idempotent.
 *
 * Behavior:
 *   - Apps without app_<slug>.AppRole table → silently skipped
 *   - Empty/missing roleName → defaults to "Admin"
 *   - Role name not found in DB → skipped (tolerant of half-configured apps)
 *
 * One role per (user, org, app): the previous role is deleted before the new
 * one is inserted. The old ON CONFLICT-only insert never removed the prior
 * role, so an Admin-Portal promotion/demotion stacked a second UserAppRole on
 * top of the old one — leaving the app reading a stale/ambiguous role. This is
 * the Admin-Portal → app direction of the role sync.
 */
export async function assignAppRoles(
  db: PrismaClient,
  orgId: string,
  assignments: RoleAssignment[],
): Promise<void> {
  if (assignments.length === 0) return;

  const appIds = [...new Set(assignments.map((a) => a.appId))];
  const apps = await db.app.findMany({
    where: { id: { in: appIds } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(apps.map((a) => [a.id, a.slug]));

  for (const { userId, appId, roleName } of assignments) {
    const slug = slugById.get(appId);
    if (!slug || !SAFE_SLUG.test(slug)) continue;
    if (!(await appHasRbac(db, slug))) continue;

    const effective = roleName && roleName.trim() ? roleName : "Admin";
    const roleId = await resolveRoleId(db, orgId, appId, slug, effective);
    if (!roleId) continue;

    // Replace the single per-app role. Each app_<slug> schema holds only that
    // one app's roles, so scoping the delete by (userId, orgId) is per-app —
    // and matches the delete-then-insert convention every app uses in its own
    // role-change handler.
    await db.$executeRawUnsafe(
      `DELETE FROM "app_${slug}"."UserAppRole" WHERE "userId" = $1 AND "orgId" = $2`,
      userId, orgId,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "app_${slug}"."UserAppRole"
         ("id","userId","orgId","roleId","assignedAt")
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT ("userId","orgId","roleId") DO NOTHING`,
      randomUUID(), userId, orgId, roleId,
    );

    await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName: effective });
  }
}

/**
 * Mirror an app role name onto the central `quikit.UserAppAccess.role` column —
 * the value the Admin Portal reads and displays for "Roles per Application".
 *
 * The single source of truth for a user's role is the app's own
 * `app_<slug>.UserAppRole → AppRole`; `UserAppAccess.role` is a denormalised
 * copy of that role's NAME kept in lock-step so the Admin Portal stays
 * consistent. Every place that changes a per-app role — the Admin Portal, an
 * invite flow, or an app's own User Permissions screen — calls this so a change
 * on one side is reflected on the other.
 *
 * No-op when `roleName` is empty (a revoke leaves the access row's role as-is;
 * the column is NOT NULL) or when the user has no access row for the app.
 */
export async function mirrorAppRoleToCentral(
  db: PrismaClient,
  params: { orgId: string; userId: string; appId: string; roleName: string | null | undefined },
): Promise<void> {
  const { orgId, userId, appId, roleName } = params;
  if (!roleName || !roleName.trim()) return;
  await db.userAppAccess.updateMany({
    where: { orgId, userId, appId },
    data: { role: roleName },
  });
}
