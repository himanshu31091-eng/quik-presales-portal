import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { NAV_KEYS, allPermissionPairs } from "@/lib/api/permissionsRegistry";
import { getQuikPreSalesAppId, hasAdminAccess, seedAllDefaultRoles } from "@/lib/api/rbac";

/**
 * GET /api/me/permissions
 *
 * The caller's effective permission set, used by the sidebar and by client
 * components that hide actions the user can't perform. Server handlers never
 * trust this — they re-check with `requirePermission`.
 *
 * Response mirrors quiktrack's `MyPermissions`:
 *   isAdmin      — org-tier admin OR holder of the `admin` app role
 *   roleId/Name  — the app role they hold (one per app, per assign-app-roles)
 *   permissions  — "resource:action", UNION of role grants and user extras
 *   extras       — the subset that came from PsUserPermissionExtra
 *   navigation   — navKeys visible in the sidebar
 *
 * Also the natural place to run the idempotent role seeder, since it's hit
 * once per app load.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  await seedAllDefaultRoles(orgId);

  const isAdmin = await hasAdminAccess(userId, orgId);
  if (isAdmin) {
    // Admins get the full matrix without a lookup — the same short-circuit the
    // server-side gate applies, so client and server can't disagree.
    return NextResponse.json({
      success: true,
      data: {
        isAdmin: true,
        roleId: null,
        roleName: null,
        permissions: allPermissionPairs().map((p) => `${p.resource}:${p.action}`),
        extras: [],
        navigation: [...NAV_KEYS],
      },
    });
  }

  const appId = await getQuikPreSalesAppId();
  if (!appId) {
    return NextResponse.json({
      success: true,
      data: {
        isAdmin: false,
        roleId: null,
        roleName: null,
        permissions: [],
        extras: [],
        navigation: [],
      },
    });
  }

  const [assignment, grants, extraRows] = await Promise.all([
    db.psUserAppRole.findFirst({
      where: { userId, orgId, role: { appId } },
      select: { role: { select: { id: true, name: true } } },
    }),
    db.psRolePermission.findMany({
      where: { role: { appId, orgId, members: { some: { userId, orgId } } } },
      select: { resource: true, action: true },
    }),
    db.psUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  const extras = Array.from(new Set(extraRows.map((e) => `${e.resource}:${e.action}`)));
  // Effective set is the union — a role grant and an extra granting the same
  // pair must not surface twice.
  const permissions = Array.from(
    new Set([...grants.map((g) => `${g.resource}:${g.action}`), ...extras]),
  ).sort();

  const navRows = await db.psRoleNavigation.findMany({
    where: { role: { appId, orgId, members: { some: { userId, orgId } } } },
    select: { navKey: true },
  });
  const navigation = Array.from(new Set(navRows.map((n) => n.navKey)));

  return NextResponse.json({
    success: true,
    data: {
      isAdmin: false,
      roleId: assignment?.role.id ?? null,
      roleName: assignment?.role.name ?? null,
      permissions,
      extras,
      navigation,
    },
  });
});
