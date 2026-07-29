/**
 * inspect-demo.ts — quick read-only inspection of the Neon DB:
 *  - lists Apps in quikit.App
 *  - shows whether the demo user / org / memberships / app access exist
 *
 * Run from packages/database:
 *   DATABASE_URL='<neon-pooler-url>' npx tsx prisma/inspect-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const DEMO_USER_EMAIL = "tireb33930@nuitx.com";
const DEMO_ORG_SLUG = "demo-co";

const prisma = new PrismaClient();

async function main() {
  console.log("\n📋 Registered apps:");
  const apps = await prisma.app.findMany({
    select: { id: true, slug: true, name: true, status: true, baseUrl: true },
    orderBy: { slug: "asc" },
  });
  for (const a of apps) {
    console.log(`  ${a.slug.padEnd(15)} ${a.status.padEnd(8)} ${a.name}  (${a.baseUrl})`);
  }

  console.log("\n👤 Demo user:");
  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true, mustChangePassword: true, createdAt: true },
  });
  console.log(user ?? "  (none)");

  console.log("\n🏢 Demo org:");
  const org = await prisma.org.findUnique({
    where: { slug: DEMO_ORG_SLUG },
    select: { id: true, name: true, slug: true, plan: true, status: true, brandColor: true, fiscalYearStart: true },
  });
  console.log(org ?? "  (none)");

  if (user && org) {
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    console.log("\n🤝 Membership:", member);

    const userAccess = await prisma.userAppAccess.findMany({
      where: { userId: user.id, orgId: org.id },
      include: { app: { select: { slug: true } } },
    });
    console.log("\n🔓 User app access:", userAccess.map(a => `${a.app.slug}(${a.role})`));

    const orgAccess = await prisma.orgAppAccess.findMany({
      where: { orgId: org.id },
      include: { app: { select: { slug: true } } },
    });
    console.log("🚪 Org app gate:    ", orgAccess.map(a => `${a.app.slug}(enabled=${a.enabled})`));
  }

  if (org) {
    const counts = {
      teams: await prisma.team.count({ where: { orgId: org.id } }),
      kpis: await prisma.kPI.count({ where: { orgId: org.id } }),
      kpiWeekly: await prisma.kPIWeeklyValue.count({ where: { orgId: org.id } }),
      priorities: await prisma.priority.count({ where: { orgId: org.id } }),
      wwwItems: await prisma.wWWItem.count({ where: { orgId: org.id } }),
      quarters: await prisma.quarterSetting.count({ where: { orgId: org.id } }),
      categories: await prisma.categoryMaster.count({ where: { orgId: org.id } }),
      qtProjects: await prisma.qtProject.count({ where: { orgId: org.id } }).catch(() => "n/a"),
      qtIssues: await prisma.qtIssue.count({ where: { orgId: org.id } }).catch(() => "n/a"),
      qtTeams: await prisma.qtTeam.count({ where: { orgId: org.id } }).catch(() => "n/a"),
    };
    console.log("\n📈 Counts:", counts);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
