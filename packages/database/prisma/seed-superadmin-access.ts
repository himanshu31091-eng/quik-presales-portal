/**
 * Grant ashwin@moreyeahs.com app access to quikscale + admin within Moreyeahs org.
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APP_DEFS = [
  { slug: "quikscale", name: "QuikScale", baseUrl: "http://localhost:3002" },
  { slug: "admin", name: "Admin Portal", baseUrl: "http://localhost:3005" },
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "ashwin@moreyeahs.com" } });
  if (!user) throw new Error("User ashwin@moreyeahs.com not found — run seed-superadmin.ts first");
  const org = await prisma.org.findUnique({ where: { slug: "moreyeahs" } });
  if (!org) throw new Error("Org moreyeahs not found — run seed-superadmin.ts first");

  for (const def of APP_DEFS) {
    const app = await prisma.app.upsert({
      where: { slug: def.slug },
      update: {},
      create: { slug: def.slug, name: def.name, baseUrl: def.baseUrl, status: "active" },
    });
    console.log(`✅ App: ${app.slug} (${app.id})`);

    await prisma.orgAppAccess.upsert({
      where: { orgId_appId: { orgId: org.id, appId: app.id } },
      update: { enabled: true },
      create: { orgId: org.id, appId: app.id, enabled: true },
    });
    console.log(`   ✅ OrgAppAccess: ${org.slug} → ${app.slug} enabled`);

    await prisma.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: user.id, orgId: org.id, appId: app.id } },
      update: { role: "admin" },
      create: { userId: user.id, orgId: org.id, appId: app.id, role: "admin" },
    });
    console.log(`   ✅ UserAppAccess: ${user.email} → ${app.slug} role=admin`);
  }

  console.log("\n🎉 Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
