/**
 * Member role synchronisation (Req 1 / Req 2).
 *
 * A member's authority lives in three places:
 *   1. `OrgMember.role` (quikit schema)        — org-level tier; drives Admin
 *                                                 Portal access via middleware +
 *                                                 the JWT membershipRole re-check.
 *   2. `UserAppAccess.role` (quikit schema)     — per-app baseline grant.
 *   3. `app_<slug>.UserAppRole` (per-app RBAC)  — named role INSIDE each product
 *                                                 app (e.g. quikscale, quiktrack).
 *
 * `syncMemberRole` is the single place that keeps all three consistent when a
 * Super Admin promotes a member to Org Admin or demotes them back to Member.
 *
 * Promote → org_admin: grant `admin` UserAppAccess + the per-app system admin
 *   role on every provisioned app.
 * Demote  → member:    downgrade UserAppAccess to `member` + swap the per-app
 *   system admin role for the app's default (isDefault) role.
 *
 * The per-app RBAC step keys off the `isSystem` / `isDefault` flags rather than
 * role names, so it works uniformly across apps regardless of how each names
 * its admin/default role ("admin" vs "Admin"). Apps that have not yet seeded
 * their RBAC tables are silently skipped — their lazy-seed on first login plus
 * the authoritative `OrgMember.role` still convey the right intent.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { MEMBERSHIP_ROLES } from "@quikit/shared";

const SAFE_SLUG = /^[a-z0-9_-]+$/;

export type SyncableRole =
  | typeof MEMBERSHIP_ROLES.ORG_ADMIN
  | typeof MEMBERSHIP_ROLES.MEMBER;

async function appHasRbac(db: PrismaClient, slug: string): Promise<boolean> {
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

async function roleIdByFlag(
  db: PrismaClient,
  orgId: string,
  appId: string,
  slug: string,
  flag: "isSystem" | "isDefault",
): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "app_${slug}"."AppRole"
      WHERE "orgId" = $1 AND "appId" = $2 AND "${flag}" = true
      LIMIT 1`,
    orgId,
    appId,
  );
  return rows[0]?.id ?? null;
}

async function ensureUserAppRole(
  db: PrismaClient,
  slug: string,
  orgId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "app_${slug}"."UserAppRole"
       ("id","userId","orgId","roleId","assignedAt")
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT ("userId","orgId","roleId") DO NOTHING`,
    randomUUID(),
    userId,
    orgId,
    roleId,
  );
}

async function removeUserAppRole(
  db: PrismaClient,
  slug: string,
  orgId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM "app_${slug}"."UserAppRole"
      WHERE "userId" = $1 AND "orgId" = $2 AND "roleId" = $3`,
    userId,
    orgId,
    roleId,
  );
}

/**
 * Swap the per-app RBAC role for one (user, app) between the app's system admin
 * role and its default member role. No-op when the app lacks RBAC tables or the
 * relevant role row hasn't been seeded yet.
 */
async function cascadePerAppRole(
  db: PrismaClient,
  orgId: string,
  userId: string,
  appId: string,
  slug: string,
  makeAdmin: boolean,
): Promise<void> {
  if (!SAFE_SLUG.test(slug)) return;
  if (!(await appHasRbac(db, slug))) return;

  const [adminRoleId, defaultRoleId] = await Promise.all([
    roleIdByFlag(db, orgId, appId, slug, "isSystem"),
    roleIdByFlag(db, orgId, appId, slug, "isDefault"),
  ]);

  if (makeAdmin) {
    if (defaultRoleId) await removeUserAppRole(db, slug, orgId, userId, defaultRoleId);
    if (adminRoleId) await ensureUserAppRole(db, slug, orgId, userId, adminRoleId);
  } else {
    if (adminRoleId) await removeUserAppRole(db, slug, orgId, userId, adminRoleId);
    if (defaultRoleId) await ensureUserAppRole(db, slug, orgId, userId, defaultRoleId);
  }
}

/**
 * Update a member's org-level role and cascade the per-app effects.
 *
 * Safe to call from both the role-edit PATCH route and the Add Member POST
 * (so a freshly-added Org Admin gets the same per-app admin grants).
 */
export async function syncMemberRole(
  db: PrismaClient,
  params: {
    orgId: string;
    userId: string;
    newRole: SyncableRole;
    actorId?: string;
  },
): Promise<void> {
  const { orgId, userId, newRole, actorId } = params;
  const makeAdmin = newRole === MEMBERSHIP_ROLES.ORG_ADMIN;
  const appRole = makeAdmin ? "admin" : "member";

  // 1. Authoritative org-level role.
  await db.orgMember.update({
    where: { orgId_userId: { orgId, userId } },
    data: { role: newRole },
  });

  // 2. Per-app baseline access + RBAC role for every provisioned app.
  const provisioned = await db.orgAppAccess.findMany({
    where: { orgId, enabled: true },
    select: { appId: true, app: { select: { slug: true } } },
  });

  for (const { appId, app } of provisioned) {
    await db.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId, orgId, appId } },
      create: { userId, orgId, appId, role: appRole, grantedBy: actorId ?? null },
      update: { role: appRole },
    });

    // Best-effort cross-schema RBAC sync — never block the role change on it.
    await cascadePerAppRole(db, orgId, userId, appId, app.slug, makeAdmin).catch(() => {});
  }
}
