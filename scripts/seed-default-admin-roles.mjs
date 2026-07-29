// Seeds a default "Admin" AppRole (system + default, manage-everything)
// for every (org, app) tuple where OrgAppAccess.enabled = true, scoped to
// apps that have RBAC v2 tables (quikscale, quiktrack).
//
// Idempotent: safe to re-run. Uses ON CONFLICT DO NOTHING on the unique
// indexes.
//
// Resource / nav lists are duplicated here from each app's
// lib/api/permissionsRegistry.ts — sync manually when the registry changes.
// (We don't dynamic-import the TS registry from a monorepo .mjs because
// workspace path resolution + TS compile in a Node script is ugly.)
//
// Run from repo root:
//   DATABASE_URL='...' DATABASE_URL_DIRECT='...' \
//     node scripts/seed-default-admin-roles.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

/* ────────────────────────── Per-app registry mirrors ────────────────────────── */

const REGISTRIES = {
  quikscale: {
    schema: "app_quikscale",
    actions: ["view", "create", "update", "delete"],
    // (resource, allowedActions) pairs — mirror PERMISSION_TREE leaves
    resources: [
      ["Dashboard", ["view"]],
      ["KPI", ["view", "create", "update", "delete"]],
      ["TeamKPI", ["view", "create", "update", "delete"]],
      ["Priority", ["view", "create", "update", "delete"]],
      ["Team", ["view", "create", "update", "delete"]],
      ["User", ["view", "create", "update", "delete"]],
      ["Quarter", ["view", "create", "update", "delete"]],
      ["WWW", ["view", "create", "update", "delete"]],
      ["ClientMaster", ["view", "create", "update", "delete"]],
      ["ClientMember", ["view", "create", "update", "delete"]],
      ["DailyHuddle", ["view", "create", "update", "delete"]],
      ["WeeklyMeeting", ["view", "create", "update", "delete"]],
      ["OPSP.Create", ["view", "create", "update", "delete"]],
      ["OPSP.History", ["view", "create", "update", "delete"]],
      ["OPSP.History.EditFinalize", ["update"]],
      ["OPSP.Review", ["view", "create", "update", "delete"]],
      ["OPSP.Categories", ["view", "create", "update", "delete"]],
    ],
    navKeys: [
      "dashboard", "kpi.individual", "kpi.teams", "priority", "www",
      "orgSetup.teams", "orgSetup.users", "orgSetup.quarters",
      "clientMeetings.dashboard", "clientMeetings.clients", "clientMeetings.members",
      "clientMeetings.dailyHuddle", "clientMeetings.weeklyMeeting",
      "opsp.create", "opsp.history", "opsp.review", "opsp.categories",
    ],
  },

  quiktrack: {
    schema: "app_quiktrack",
    actions: ["view", "create", "update", "delete"],
    resources: [
      ["Home", ["view"]],
      ["Project", ["view", "create", "update", "delete"]],
      ["ProjectMember", ["view", "create", "update", "delete"]],
      ["Sprint", ["view", "create", "update", "delete"]],
      ["Issue", ["view", "create", "update", "delete"]],
      ["IssueComment", ["view", "create", "update", "delete"]],
      ["IssueStatus", ["view", "create", "update", "delete"]],
      ["IssueType", ["view", "create", "update", "delete"]],
      ["Board", ["view", "update"]],
      ["Timesheet", ["view", "create", "update", "delete"]],
      ["TimesheetWeekly", ["view"]],
      ["Report", ["view"]],
      ["Report.TaskTime", ["view"]],
      ["Dashboard", ["view", "create", "update", "delete"]],
      ["Doc", ["view", "create", "update", "delete"]],
      ["Page", ["view", "create", "update", "delete"]],
      ["Team", ["view", "create", "update", "delete"]],
      ["TeamMember", ["view", "create", "update", "delete"]],
      ["User", ["view", "create", "update", "delete"]],
      ["Invitation", ["view", "create", "update", "delete"]],
      ["Feedback", ["create", "view"]],
    ],
    navKeys: [
      "home", "spaces", "spaces.templates", "issues", "boards",
      "timesheet", "reports", "dashboards", "docs", "plans",
      "teams", "orgSetup.users", "orgSetup.invitations",
    ],
  },
};

/* ────────────────────────── Seeder ────────────────────────── */

async function seedAdminRoleFor({ orgId, appId, slug }) {
  const registry = REGISTRIES[slug];
  if (!registry) return { skipped: true };

  const schema = registry.schema;
  const roleId = randomUUID();

  // 1. Upsert "Admin" AppRole. ON CONFLICT (orgId, appId, name) → no-op.
  const existing = await db.$queryRawUnsafe(
    `SELECT id FROM "${schema}"."AppRole" WHERE "orgId"=$1 AND "appId"=$2 AND "name"=$3 LIMIT 1`,
    orgId, appId, "Admin",
  );
  let useRoleId = existing[0]?.id;

  if (!useRoleId) {
    await db.$executeRawUnsafe(
      `INSERT INTO "${schema}"."AppRole"
         ("id","orgId","appId","name","description","isSystem","isDefault","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,true,NOW(),NOW())
       ON CONFLICT ("orgId","appId","name") DO NOTHING`,
      roleId, orgId, appId, "Admin", "System role — full access to every resource",
    );
    useRoleId = roleId;
  }

  // 2. Permissions matrix
  let permCount = 0;
  for (const [resource, actions] of registry.resources) {
    for (const action of actions) {
      const res = await db.$executeRawUnsafe(
        `INSERT INTO "${schema}"."RolePermission" ("id","roleId","resource","action")
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("roleId","resource","action") DO NOTHING`,
        randomUUID(), useRoleId, resource, action,
      );
      permCount += res;
    }
  }

  // 3. Navigation
  let navCount = 0;
  for (const navKey of registry.navKeys) {
    const res = await db.$executeRawUnsafe(
      `INSERT INTO "${schema}"."RoleNavigation" ("id","roleId","navKey")
       VALUES ($1,$2,$3)
       ON CONFLICT ("roleId","navKey") DO NOTHING`,
      randomUUID(), useRoleId, navKey,
    );
    navCount += res;
  }

  return { roleId: useRoleId, permCount, navCount };
}

/* ────────────────────────── QuikInfra (different RBAC shape) ──────────────────────────
 * QuikInfra is NOT in REGISTRIES on purpose: its RBAC differs from quikscale/
 * quiktrack — role name is lowercase "admin" (what userCan/context.ts check),
 * permissions are `construction.*` with actions like manage/approve/import/lock,
 * and it has NO RoleNavigation table. Replicating that in the raw-SQL seeder
 * above would create a mismatched, unrecognized role. Instead we delegate to
 * QuikInfra's own /api/internal/provision-roles endpoint, which seeds its 4
 * roles + permissions correctly and assigns each org's admins — the exact call
 * the launcher fires on app-grant. (Requires the QuikInfra server reachable.)
 */
async function seedQuikInfra() {
  const base = (process.env.QUIKINFRA_URL ?? "http://localhost:3006").replace(/\/+$/, "");
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    console.log("⏭️  QuikInfra skipped — INTERNAL_SECRET not set");
    return;
  }
  const orgs = await db.$queryRaw`
    SELECT oaa."orgId", o.name AS org_name
    FROM "quikit"."OrgAppAccess" oaa
    JOIN "quikit"."App" a ON a.id = oaa."appId"
    JOIN "quikit"."Org" o ON o.id = oaa."orgId"
    WHERE oaa.enabled = true AND a.slug = 'quikinfra'
    ORDER BY o.name`;
  for (const org of orgs) {
    const admins = await db.$queryRaw`
      SELECT "userId" FROM "quikit"."OrgMember"
      WHERE "orgId" = ${org.orgId}
        AND lower("role") IN ('org_admin','super_admin','platform_super_admin','admin')`;
    const adminUserIds = admins.map((a) => a.userId);
    try {
      const res = await fetch(`${base}/api/internal/provision-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({ orgId: org.orgId, adminUserIds }),
      });
      console.log(
        `${res.ok ? "✅" : "❌"} ${org.org_name} × QuikInfra  ` +
        `(provision-roles HTTP ${res.status}, admins=${adminUserIds.length})`,
      );
    } catch (e) {
      console.log(`❌ ${org.org_name} × QuikInfra  (fetch failed: ${e.message})`);
    }
  }
}

/* ────────────────────────── QuikSupport (own provision endpoint) ──────────────────────────
 * QuikSupport is NOT in REGISTRIES for the same reason as QuikInfra: its
 * runtime seeder (apps/quiksupport/lib/seedAppRole.ts) creates a lowercase
 * "admin" system role (what userCan/loadMyPermissions check) plus a default
 * "Member" role — not the generic capital-"Admin" single role this script's
 * seedAdminRoleFor() would insert. Seeding "Admin" here would create a
 * mismatched role the app never recognizes. Delegate to QuikSupport's own
 * /api/internal/provision-roles endpoint, which seeds the correct roles +
 * permissions + navigation and assigns each org's admins.
 */
async function seedQuikSupport() {
  const base = (process.env.QUIKSUPPORT_URL ?? "http://localhost:3010").replace(/\/+$/, "");
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    console.log("⏭️  QuikSupport skipped — INTERNAL_SECRET not set");
    return;
  }
  const orgs = await db.$queryRaw`
    SELECT oaa."orgId", o.name AS org_name
    FROM "quikit"."OrgAppAccess" oaa
    JOIN "quikit"."App" a ON a.id = oaa."appId"
    JOIN "quikit"."Org" o ON o.id = oaa."orgId"
    WHERE oaa.enabled = true AND a.slug = 'quiksupport'
    ORDER BY o.name`;
  for (const org of orgs) {
    const admins = await db.$queryRaw`
      SELECT "userId" FROM "quikit"."OrgMember"
      WHERE "orgId" = ${org.orgId}
        AND lower("role") IN ('org_admin','super_admin','platform_super_admin','admin')`;
    const adminUserIds = admins.map((a) => a.userId);
    try {
      const res = await fetch(`${base}/api/internal/provision-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({ orgId: org.orgId, adminUserIds }),
      });
      console.log(
        `${res.ok ? "✅" : "❌"} ${org.org_name} × QuikSupport  ` +
        `(provision-roles HTTP ${res.status}, admins=${adminUserIds.length})`,
      );
    } catch (e) {
      console.log(`❌ ${org.org_name} × QuikSupport  (fetch failed: ${e.message})`);
    }
  }
}

async function main() {
  // QuikInfra + QuikSupport seed via their own provision-roles endpoints
  // (different RBAC shape — see notes above each function).
  await seedQuikInfra();
  await seedQuikSupport();

  // Find every (org, app) where the app is enabled AND has a registry.
  const rows = await db.$queryRaw`
    SELECT oaa."orgId", oaa."appId", a.slug, o.name AS org_name, a.name AS app_name
    FROM "quikit"."OrgAppAccess" oaa
    JOIN "quikit"."App" a ON a.id = oaa."appId"
    JOIN "quikit"."Org" o ON o.id = oaa."orgId"
    WHERE oaa.enabled = true
      AND a.slug = ANY(${Object.keys(REGISTRIES)})
    ORDER BY o.name, a.name`;

  if (rows.length === 0) {
    console.log("ℹ️  No (org, app) tuples to seed — no OrgAppAccess.enabled rows yet.");
    console.log("    Run again after the SuperAdmin enables apps for an org.");
    return;
  }

  for (const r of rows) {
    const result = await seedAdminRoleFor({
      orgId: r.orgId, appId: r.appId, slug: r.slug,
    });
    console.log(
      `✅ ${r.org_name} × ${r.app_name}  ` +
      `role=${result.roleId?.slice(0, 8) ?? "skipped"}  ` +
      `perms+=${result.permCount}  nav+=${result.navCount}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
