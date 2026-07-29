/**
 * One-shot: ensure Moreyeahs org + ashwin@moreyeahs.com superadmin exist.
 *
 * Run: cd packages/database && \
 *   DATABASE_URL=postgresql://...@localhost:5432/quikit_dev \
 *   npx tsx prisma/seed-superadmin.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.org.upsert({
    where: { slug: "moreyeahs" },
    update: {},
    create: { name: "Moreyeahs", slug: "moreyeahs", plan: "scale" },
  });
  console.log(`✅ Org: ${org.name} (${org.id})`);

  const user = await prisma.user.upsert({
    where: { email: "ashwin@moreyeahs.com" },
    update: { isSuperAdmin: true, password: passwordHash, emailVerified: new Date() },
    create: {
      email: "ashwin@moreyeahs.com",
      password: passwordHash,
      firstName: "Ashwin",
      lastName: "Singh",
      isSuperAdmin: true,
      emailVerified: new Date(),
    },
  });
  console.log(`✅ User: ${user.email} (${user.id})  isSuperAdmin=${user.isSuperAdmin}`);

  const member = await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: { role: "org_admin", status: "active", acceptedAt: new Date() },
    create: {
      orgId: org.id,
      userId: user.id,
      role: "org_admin",
      status: "active",
      acceptedAt: new Date(),
    },
  });
  console.log(`✅ OrgMember: role=${member.role} status=${member.status}`);

  console.log(`\n🎉 Sign in: ashwin@moreyeahs.com / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
