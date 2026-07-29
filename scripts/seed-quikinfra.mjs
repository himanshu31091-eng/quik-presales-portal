#!/usr/bin/env node
/**
 * Seeds a "QuikInfra Demo" tenant with:
 *   - 1 Tenant
 *   - 5 users (same emails as standalone CnDemoUser) with password "password123"
 *   - Membership + UserAppAccess for quikinfra app
 *   - 2 sample CnCompany rows
 *   - 3 sample CnVendor rows
 *
 * Run once locally after `prisma db push` + `seed-oauth.ts`:
 *   DATABASE_URL=... node scripts/seed-quikinfra.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DB_URL = process.env.DATABASE_URL ?? "postgresql://user@localhost:5432/quikscale_dev";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const DEMO_USERS = [
  { email: "amit@quikinfra.com",   firstName: "Amit",    lastName: "Deshmukh", role: "admin"  },
  { email: "priya@quikinfra.com",  firstName: "Priya",   lastName: "Kulkarni", role: "admin"  },
  { email: "rajesh@quikinfra.com", firstName: "Rajesh",  lastName: "Iyer",     role: "member" },
  { email: "sanjay@quikinfra.com", firstName: "Sanjay",  lastName: "More",     role: "member" },
  { email: "rakesh@quikinfra.com", firstName: "Rakesh",  lastName: "Patil",    role: "member" },
];

async function main() {
  console.log("→ Seeding QuikInfra Demo tenant…");

  // 1. App lookup (quikinfra must already be registered via seed-oauth)
  const app = await prisma.app.findUnique({ where: { slug: "quikinfra" } });
  if (!app) {
    throw new Error(
      "App 'quikinfra' not found. Run `npx tsx packages/database/prisma/seed-oauth.ts` first.",
    );
  }

  // 2. Tenant upsert
  const tenant = await prisma.tenant.upsert({
    where: { slug: "quikinfra-demo" },
    update: {},
    create: { name: "QuikInfra Demo", slug: "quikinfra-demo" },
  });
  console.log(`  tenant: ${tenant.name} (${tenant.id})`);

  // 3. Users + Membership + UserAppAccess
  const passwordHash = await bcrypt.hash("password123", 10);
  let userCount = 0;
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, firstName: u.firstName, lastName: u.lastName, password: passwordHash },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: { role: u.role, status: "active" },
      create: { tenantId: tenant.id, userId: user.id, role: u.role, status: "active" },
    });
    await prisma.userAppAccess.upsert({
      where: { userId_tenantId_appId: { userId: user.id, tenantId: tenant.id, appId: app.id } },
      update: { role: u.role },
      create: { userId: user.id, tenantId: tenant.id, appId: app.id, role: u.role },
    });
    userCount++;
  }
  console.log(`  users: ${userCount}`);

  const bootstrap = await prisma.user.findUnique({ where: { email: DEMO_USERS[0].email } });
  const createdBy = bootstrap.id;

  // 4. Sample Companies
  const companies = [
    {
      name: "QuikInfra Builders",
      legalName: "QuikInfra Builders Pvt. Ltd.",
      gstin: "27AAACQ1234A1Z5",
      pan: "AAACQ1234A",
      address: "Plot 12, Hinjewadi Phase 1",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411057",
      phone: "020-12345678",
      email: "ho@quikinfra.com",
    },
    {
      name: "Sahyadri Construction",
      legalName: "Sahyadri Construction LLP",
      gstin: "27AAACS5678B1Z3",
      pan: "AAACS5678B",
      address: "Survey 45, Baner Road",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411045",
    },
  ];
  for (const c of companies) {
    const existing = await prisma.cnCompany.findFirst({
      where: { tenantId: tenant.id, gstin: c.gstin },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.cnCompany.create({
      data: { ...c, tenantId: tenant.id, status: "active", createdBy },
    });
  }
  console.log(`  companies: upserted ${companies.length}`);

  // 5. Sample Vendors
  const vendors = [
    { code: "V-CEM-001", name: "UltraCement Pvt Ltd",    gstin: "27AAACU1111A1Z1", city: "Pune",   paymentTermsDays: 30, rating: 4 },
    { code: "V-STL-001", name: "Bharat Steel Suppliers", gstin: "27AAACB2222B1Z2", city: "Mumbai", paymentTermsDays: 45, rating: 5 },
    { code: "V-LAB-001", name: "SiteWorks Labour Co.",   gstin: null,              city: "Nashik", paymentTermsDays: 7,  rating: 3 },
  ];
  for (const v of vendors) {
    const existing = await prisma.cnVendor.findFirst({
      where: { tenantId: tenant.id, code: v.code },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.cnVendor.create({
      data: { ...v, tenantId: tenant.id, status: "active", createdBy },
    });
  }
  console.log(`  vendors: upserted ${vendors.length}`);

  console.log(`
╔══════════════════════════════════════════════════╗
║  QuikInfra Demo tenant seeded             ║
╠══════════════════════════════════════════════════╣
║  Tenant:    ${tenant.name.padEnd(36)} ║
║  Users:     ${String(DEMO_USERS.length).padEnd(36)} ║
║  Companies: ${String(companies.length).padEnd(36)} ║
║  Vendors:   ${String(vendors.length).padEnd(36)} ║
╚══════════════════════════════════════════════════╝

Login with any of: ${DEMO_USERS.map((u) => u.email).join(", ")}
Password: password123
`);
}

main()
  .catch((e) => {
    console.error("✖ SEED FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
