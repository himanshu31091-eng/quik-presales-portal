/**
 * Idempotent E2E test tenant seeder.
 *
 * Wipes and recreates a single known tenant (`e2e-tenant`) with three users:
 *   - e2e-admin@test.com   → owner role (full admin)
 *   - e2e-head@test.com    → team head
 *   - e2e-member@test.com  → plain member
 *
 * Password for all three: E2ETest123!
 *
 * This script ONLY touches rows belonging to the e2e tenant — all other
 * tenant data is left untouched. Safe to run against a dev database.
 *
 * Usage:
 *   npm run db:seed:e2e
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const E2E_TENANT_SLUG = "e2e-tenant";
const E2E_PASSWORD = "E2ETest123!";
const E2E_ADMIN_EMAIL = "e2e-admin@test.com";
const E2E_HEAD_EMAIL = "e2e-head@test.com";
const E2E_MEMBER_EMAIL = "e2e-member@test.com";
// Super admin — used by quikit Playwright specs for super-admin surface area
// (tenant list, feature flags, impersonation, etc.). NOT a member of any tenant.
const E2E_SUPER_ADMIN_EMAIL = "e2e-super@test.com";

async function wipeExistingE2ETenant() {
  const existing = await prisma.org.findUnique({
    where: { slug: E2E_TENANT_SLUG },
  });
  if (!existing) return;

  // Cascade-style cleanup: remove the E2E tenant and its owned rows.
  // Order matters when relations have Restrict cascade rules.
  await prisma.kPIWeeklyValue.deleteMany({
    where: { kpi: { tenantId: existing.id } },
  });
  await prisma.kPILog.deleteMany({ where: { tenantId: existing.id } });
  await prisma.kPINote.deleteMany({ where: { tenantId: existing.id } });
  await prisma.kPI.deleteMany({ where: { tenantId: existing.id } });
  await prisma.orgMember.deleteMany({ where: { tenantId: existing.id } });
  await prisma.team.deleteMany({ where: { tenantId: existing.id } });
  await prisma.org.delete({ where: { id: existing.id } });

  // Delete the E2E users if they have no remaining memberships
  for (const email of [E2E_ADMIN_EMAIL, E2E_HEAD_EMAIL, E2E_MEMBER_EMAIL]) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    const otherMemberships = await prisma.orgMember.count({
      where: { userId: user.id },
    });
    if (otherMemberships === 0) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }

  // Super admin has no memberships — always safe to delete on re-seed.
  const superAdmin = await prisma.user.findUnique({ where: { email: E2E_SUPER_ADMIN_EMAIL } });
  if (superAdmin) {
    await prisma.user.delete({ where: { id: superAdmin.id } });
  }
}

async function main() {
  console.log("🧹 Cleaning up previous E2E tenant...");
  await wipeExistingE2ETenant();

  console.log("🌱 Seeding E2E tenant...");

  const hashed = await bcrypt.hash(E2E_PASSWORD, 10);

  const tenant = await prisma.org.create({
    data: {
      name: "E2E Test Tenant",
      slug: E2E_TENANT_SLUG,
      description: "Automated E2E testing tenant — do not use manually",
      plan: "growth",
      brandColor: "#0066cc",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    update: { password: hashed },
    create: {
      email: E2E_ADMIN_EMAIL,
      firstName: "E2E",
      lastName: "Admin",
      password: hashed,
    },
  });

  const head = await prisma.user.upsert({
    where: { email: E2E_HEAD_EMAIL },
    update: { password: hashed },
    create: {
      email: E2E_HEAD_EMAIL,
      firstName: "E2E",
      lastName: "Head",
      password: hashed,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: E2E_MEMBER_EMAIL },
    update: { password: hashed },
    create: {
      email: E2E_MEMBER_EMAIL,
      firstName: "E2E",
      lastName: "Member",
      password: hashed,
    },
  });

  const team = await prisma.team.create({
    data: {
      tenantId: tenant.id,
      name: "E2E Test Team",
      slug: "e2e-test-team",
      headId: head.id,
    },
  });

  await prisma.orgMember.create({
    data: {
      userId: admin.id,
      tenantId: tenant.id,
      role: "admin",
      status: "active",
    },
  });
  await prisma.orgMember.create({
    data: {
      userId: head.id,
      tenantId: tenant.id,
      teamId: team.id,
      role: "manager",
      status: "active",
    },
  });
  await prisma.orgMember.create({
    data: {
      userId: member.id,
      tenantId: tenant.id,
      teamId: team.id,
      role: "employee",
      status: "active",
    },
  });

  // Super admin user — used by quikit super-admin Playwright specs. Lives
  // outside any tenant. `isSuperAdmin: true` grants access to the super-admin
  // surface area.
  const superAdmin = await prisma.user.upsert({
    where: { email: E2E_SUPER_ADMIN_EMAIL },
    update: { password: hashed, isSuperAdmin: true },
    create: {
      email: E2E_SUPER_ADMIN_EMAIL,
      firstName: "E2E",
      lastName: "SuperAdmin",
      password: hashed,
      isSuperAdmin: true,
    },
  });

  console.log("✅ E2E seed complete");
  console.log(`   Tenant:      ${tenant.slug} (${tenant.id})`);
  console.log(`   Admin:       ${admin.email}`);
  console.log(`   Head:        ${head.email}`);
  console.log(`   Member:      ${member.email}`);
  console.log(`   SuperAdmin:  ${superAdmin.email}`);
  console.log(`   Password:    ${E2E_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("❌ E2E seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
