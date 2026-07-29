// One-shot inspection script for the Quikit org's data integrity.
// Run from repo root: node scripts/inspect-quikit-org.mjs
//
// Walks the data the way apps/quikit's launcher does so we see exactly what
// the app would render: org → members → org-app entitlements (OrgAppAccess)
// → per-user app access (UserAppAccess).

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function section(title) {
  console.log("\n" + "═".repeat(80));
  console.log("  " + title);
  console.log("═".repeat(80));
}

async function main() {
  const ORG_SLUG = "quikit";
  const TARGET_EMAIL = "pravinsharma8982@gmail.com";

  section(`Org: slug = "${ORG_SLUG}"`);
  const org = await db.org.findUnique({
    where: { slug: ORG_SLUG },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      createdAt: true,
    },
  });
  if (!org) {
    console.log(`No Org row found with slug="${ORG_SLUG}". Aborting.`);
    process.exit(0);
  }
  console.log(JSON.stringify(org, null, 2));

  section(`Org members for orgId="${org.id}"`);
  const members = await db.orgMember.findMany({
    where: { orgId: org.id },
    select: {
      id: true,
      role: true,
      status: true,
      inviteMethod: true,
      inviteAppIds: true,
      invitedAt: true,
      acceptedAt: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${members.length} member(s):`);
  for (const m of members) {
    console.log(`  • ${m.user.email}  →  role=${m.role}  status=${m.status}  inviteMethod=${m.inviteMethod ?? "(none)"}  invitedAt=${m.invitedAt?.toISOString() ?? "-"}  acceptedAt=${m.acceptedAt?.toISOString() ?? "-"}  inviteAppIds=${JSON.stringify(m.inviteAppIds ?? [])}`);
  }

  section(`OrgAppAccess (super-admin's per-org app entitlements)`);
  const orgAccess = await db.orgAppAccess.findMany({
    where: { orgId: org.id },
    select: {
      enabled: true,
      reason: true,
      updatedBy: true,
      updatedAt: true,
      app: { select: { id: true, slug: true, name: true, requiresOrgAdmin: true, status: true } },
    },
    orderBy: { app: { name: "asc" } },
  });
  console.log(`Found ${orgAccess.length} row(s):`);
  for (const a of orgAccess) {
    console.log(`  • ${a.app.slug.padEnd(20)}  enabled=${a.enabled}  requiresOrgAdmin=${a.app.requiresOrgAdmin}  appStatus=${a.app.status}  reason=${a.reason ?? "-"}  updatedBy=${a.updatedBy ?? "-"}  updatedAt=${a.updatedAt.toISOString()}`);
  }

  section(`All active Apps in catalogue (for cross-reference)`);
  const allApps = await db.app.findMany({
    where: { status: { not: "disabled" } },
    select: { id: true, slug: true, name: true, status: true, requiresOrgAdmin: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${allApps.length} active app(s):`);
  for (const app of allApps) {
    const access = orgAccess.find((a) => a.app.id === app.id);
    const provisionedMark = access?.enabled === true ? "✓" : access?.enabled === false ? "✗ (explicitly off)" : "—";
    console.log(`  ${provisionedMark.padEnd(20)} ${app.slug.padEnd(20)} requiresOrgAdmin=${app.requiresOrgAdmin}  status=${app.status}`);
  }

  section(`UserAppAccess for target user (${TARGET_EMAIL}) in this org`);
  const targetUser = await db.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true, lastSignInAt: true },
  });
  if (!targetUser) {
    console.log(`No User row for ${TARGET_EMAIL}.`);
  } else {
    console.log(`User:`, targetUser);
    const userAccess = await db.userAppAccess.findMany({
      where: { userId: targetUser.id, orgId: org.id },
      select: {
        role: true,
        grantedBy: true,
        grantedAt: true,
        app: { select: { slug: true, name: true } },
      },
      orderBy: { app: { name: "asc" } },
    });
    console.log(`UserAppAccess rows: ${userAccess.length}`);
    for (const u of userAccess) {
      console.log(`  • ${u.app.slug.padEnd(20)}  role=${u.role}  grantedAt=${u.grantedAt.toISOString()}  grantedBy=${u.grantedBy ?? "-"}`);
    }
  }

  section(`What the InviteModal "Grant Access To" SHOULD show (default-OFF, exclude requiresOrgAdmin)`);
  const shouldShow = allApps.filter((app) => {
    if (app.requiresOrgAdmin) return false;
    const access = orgAccess.find((a) => a.app.id === app.id);
    return access?.enabled === true;
  });
  console.log(`${shouldShow.length} app(s) expected:`);
  for (const app of shouldShow) {
    console.log(`  • ${app.slug.padEnd(20)} ${app.name}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
