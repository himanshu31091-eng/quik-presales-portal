/**
 * DEV ONLY — entitle QuikLMS for local SSO testing.
 *
 * The IdP /api/oauth/authorize gate requires OrgAppAccess(enabled) for the org
 * and (for non-admins) a UserAppAccess row. This grants both for the `quiklms`
 * App across every existing org + active membership so any dev account can open
 * QuikLMS. Do NOT run against production.
 *
 * Run:
 *   cd packages/database
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/quikit_dev \
 *   npx tsx prisma/grant-quiklms-access.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[grant-quiklms-access] refusing to run with NODE_ENV=production.");
  }

  const app = await prisma.app.findUnique({ where: { slug: "quiklms" } });
  if (!app) throw new Error("quiklms App row not found — run seed-quiklms-oauth.ts first.");

  const orgs = await prisma.org.findMany({ select: { id: true, name: true } });
  const members = await prisma.orgMember.findMany({
    where: { status: "active" },
    select: { userId: true, orgId: true },
  });
  console.log(`Found ${orgs.length} orgs, ${members.length} active memberships.`);

  let orgGrants = 0;
  for (const org of orgs) {
    await prisma.orgAppAccess.upsert({
      where: { orgId_appId: { orgId: org.id, appId: app.id } },
      update: { enabled: true },
      create: { orgId: org.id, appId: app.id, enabled: true },
    });
    orgGrants++;
  }

  let userGrants = 0;
  for (const m of members) {
    await prisma.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: m.userId, orgId: m.orgId, appId: app.id } },
      update: {},
      create: { userId: m.userId, orgId: m.orgId, appId: app.id, role: "member" },
    });
    userGrants++;
  }

  console.log(`  ✅ OrgAppAccess enabled for ${orgGrants} org(s).`);
  console.log(`  ✅ UserAppAccess granted for ${userGrants} membership(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
