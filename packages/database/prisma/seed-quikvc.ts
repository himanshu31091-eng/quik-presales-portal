/**
 * QuikVC seed — creates everything needed to demo Sprint 2 end-to-end.
 *
 * Idempotent: safe to re-run; uses upserts. Ships a "ValleyNXT" demo tenant
 * with QuikVC enabled, the 7 verticals, scoring criteria per vertical, 5
 * user accounts (1 fund admin + 1 partner + 1 analyst + 2 founders + 1
 * investor), and 5 demo VCDeals spanning the 9 stages so the pipeline view
 * shows realistic columns on first load.
 *
 *   npm run db:seed:quikvc
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/* ─── Constants ─────────────────────────────────────────────────────────── */

const TENANT_SLUG = "valleynxt";
const TENANT_NAME = "ValleyNXT Ventures";

/**
 * Resolve QuikVC's absolute base URL — the launcher uses this for the
 * "Launch" button. Must be absolute (http(s)://...), not a relative path.
 *
 * - Dev fallback: `http://localhost:3008` (matches apps/quikvc/package.json's dev port)
 * - Prod: set QUIKVC_URL to the deployed URL (e.g., https://quikvc.vercel.app).
 *   In production we refuse to seed with localhost values — the launcher
 *   would redirect every user to localhost:3008 (broken).
 */
function resolveQuikVCUrl(): string {
  const v = process.env.QUIKVC_URL;
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[seed-quikvc] QUIKVC_URL is required when NODE_ENV=production. ` +
        `Seeding localhost or a relative path would break the launcher's ` +
        `"Launch" button for every real user. Set it before re-running.`,
    );
  }
  return "http://localhost:3008"; // prod-safety-allow: dev fallback, prod throws
}

const QUIKVC_BASE = resolveQuikVCUrl();

/** Default scoring criteria from BRD §2.2 (sum to 100%). Same list per vertical for v1. */
const DEFAULT_CRITERIA = [
  { slug: "founding-team",       name: "Founding team",                description: "Background, experience, completeness", weight: 30 },
  { slug: "financials",          name: "Financial projections",        description: "Revenue, EBITDA, unit economics",      weight: 20 },
  { slug: "market",              name: "Market size & opportunity",    description: "TAM, SAM, growth rate",                weight: 10 },
  { slug: "moat",                name: "Competitive advantage",        description: "Defensibility, IP, network effects",   weight: 10 },
  { slug: "traction",            name: "Traction",                     description: "Users, revenue, partnerships",         weight: 10 },
  { slug: "scalability",         name: "Business model scalability",   description: "Margins, distribution, ops complexity",weight: 10 },
  { slug: "qualitative",         name: "Other qualitative factors",    description: "Vision clarity, sector nuances",       weight: 10 },
];

const VERTICALS = [
  { slug: "saas",          name: "SaaS / Software",                description: "B2B + B2C software products" },
  { slug: "fintech",       name: "FinTech",                        description: "Banking, payments, lending, wealth" },
  { slug: "agritech",      name: "AgriTech",                       description: "Farm tech, supply chain, post-harvest" },
  { slug: "healthtech-d2c",name: "HealthTech & D2C",               description: "Health tech and direct-to-consumer brands" },
  { slug: "logistics",     name: "Logistics & Supply Chain",       description: "Shipping, warehousing, last-mile" },
  { slug: "consumer",      name: "Consumer Internet & E-commerce", description: "Marketplaces, social, content, retail" },
  { slug: "deeptech-ai",   name: "DeepTech & AI",                  description: "Foundational research, AI infrastructure" },
];

const STAGES = [
  "intake", "onboarding", "doc-collection", "discovery-call", "research",
  "partner-review", "ic-review", "due-diligence", "final-decision",
] as const;

/** 5 demo deals across stages, picked to make the Kanban view visually rich. */
const DEMO_DEALS = [
  { startup: "BasilSpace",       vertical: "saas",          stage: "intake",         askLakhs: 75,  loanType: "term-loan", aiScore: null },
  { startup: "PaystarRails",     vertical: "fintech",       stage: "onboarding",     askLakhs: 200, loanType: "rbf",       aiScore: 64 },
  { startup: "FieldRoots",       vertical: "agritech",      stage: "research",       askLakhs: 120, loanType: "term-loan", aiScore: 72 },
  { startup: "VitalNudge",       vertical: "healthtech-d2c",stage: "ic-review",      askLakhs: 250, loanType: "equity",    aiScore: 81 },
  { startup: "RouteCanvas",      vertical: "logistics",     stage: "final-decision", askLakhs: 180, loanType: "term-loan", aiScore: 78 },
] as const;

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  console.log("🌱 QuikVC seed starting...");

  // 1. Tenant
  const tenant = await prisma.org.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      description: "Demo VC firm for QuikVC OS",
      plan: "growth",
      brandColor: "#5b3df5",
      fiscalYearStart: 4, // April (India)
    },
  });
  console.log(`  ✓ Tenant ${tenant.name} (${tenant.id})`);

  // 2. App row + TenantAppAccess for quikvc
  //    baseUrl MUST be absolute — the launcher does `window.location.href = baseUrl`,
  //    so a relative path like "/quikvc" resolves against the launcher's host
  //    (localhost:3000) and 404s. See resolveQuikVCUrl above.
  const app = await prisma.app.upsert({
    where: { slug: "quikvc" },
    update: {
      name: "QuikVC",
      description: "AI-powered VC operating system",
      baseUrl: QUIKVC_BASE,
      iconUrl: "/app-icons/quikvc.png",
    },
    create: {
      slug: "quikvc",
      name: "QuikVC",
      description: "AI-powered VC operating system",
      baseUrl: QUIKVC_BASE,
      iconUrl: "/app-icons/quikvc.png",
      status: "active",
    },
  });
  await prisma.orgAppAccess.upsert({
    where: { tenantId_appId: { tenantId: tenant.id, appId: app.id } },
    update: { enabled: true },
    create: { tenantId: tenant.id, appId: app.id, enabled: true },
  });
  console.log(`  ✓ App registered + ${tenant.name} granted access`);

  // 3. VCFundProfile
  await prisma.vCFundProfile.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      fundName: "ValleyNXT Fund I",
      currency: "INR",
      icVotingMode: "single",
      thesis: "Backing early-stage Indian founders building category-defining businesses across SaaS, FinTech, and AgriTech. Cheque size ₹1cr–₹5cr at seed/Series A.",
      dailyBriefHour: 6,
    },
  });
  console.log(`  ✓ VCFundProfile`);

  // 4. Verticals + scoring criteria
  for (const v of VERTICALS) {
    const vertical = await prisma.vCVertical.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: v.slug } },
      update: { name: v.name, description: v.description },
      create: {
        tenantId: tenant.id, slug: v.slug, name: v.name,
        description: v.description, sortOrder: VERTICALS.indexOf(v),
      },
    });
    for (const c of DEFAULT_CRITERIA) {
      await prisma.vCScoringCriterion.upsert({
        where: { tenantId_verticalId_slug: { tenantId: tenant.id, verticalId: vertical.id, slug: c.slug } },
        update: { name: c.name, description: c.description, weight: c.weight },
        create: {
          tenantId: tenant.id, verticalId: vertical.id, slug: c.slug,
          name: c.name, description: c.description, weight: c.weight,
          sortOrder: DEFAULT_CRITERIA.indexOf(c),
        },
      });
    }
  }
  console.log(`  ✓ ${VERTICALS.length} verticals × ${DEFAULT_CRITERIA.length} criteria`);

  // 5. Users + memberships (5 accounts)
  const password = await bcrypt.hash("Password123!", 10);
  const seedUsers = [
    { email: "fund@valleynxt.test",      first: "Asha",     last: "Kapoor",    role: "fund-admin" },
    { email: "partner@valleynxt.test",   first: "Vikram",   last: "Mehta",     role: "partner" },
    { email: "analyst@valleynxt.test",   first: "Priya",    last: "Iyer",      role: "analyst" },
    { email: "founder1@example.test",    first: "Rohan",    last: "Sharma",    role: "founder" },
    { email: "founder2@example.test",    first: "Diya",     last: "Patel",     role: "founder" },
    { email: "investor1@valleynxt.test", first: "Krishnan", last: "Subramanian", role: "investor" },
  ];

  const userIds: Record<string, string> = {};
  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { firstName: u.first, lastName: u.last },
      create: { email: u.email, firstName: u.first, lastName: u.last, password },
    });
    userIds[u.role] = user.id;

    await prisma.orgMember.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: { role: u.role, status: "active" },
      create: { userId: user.id, tenantId: tenant.id, role: u.role, status: "active" },
    });

    // UserAppAccess for QuikVC — required by the org-memberships factory's
    // appSlug filter. Without this row, the user wouldn't see ValleyNXT in
    // their QuikVC org switcher even though the membership exists.
    await prisma.userAppAccess.upsert({
      where: {
        userId_tenantId_appId: { userId: user.id, tenantId: tenant.id, appId: app.id },
      },
      update: { role: u.role },
      create: { userId: user.id, tenantId: tenant.id, appId: app.id, role: u.role },
    });
  }
  console.log(`  ✓ 6 demo users + UserAppAccess (password: Password123!)`);

  // 6. Demo deals across stages (5 startups)
  for (const d of DEMO_DEALS) {
    const vertical = await prisma.vCVertical.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: d.vertical } },
    });
    if (!vertical) continue;

    const application = await prisma.vCApplication.upsert({
      where: {
        // Fallback: find by composite (tenantId + startupName) — no @@unique on this,
        // so we delete-and-recreate via findFirst pattern. For seed simplicity we
        // just create on every run if missing.
        id: `seed-app-${d.startup.toLowerCase()}`,
      },
      update: {
        status: "converted",
        // 1 lakh INR = 10,000,000 paise (smallest unit)
        fundingAsk: BigInt(d.askLakhs) * BigInt(10_000_000),
      },
      create: {
        id: `seed-app-${d.startup.toLowerCase()}`,
        tenantId: tenant.id,
        founderId: userIds["founder"],
        verticalId: vertical.id,
        startupName: d.startup,
        contactName: `${d.startup} Founder`,
        contactEmail: `team@${d.startup.toLowerCase()}.test`,
        sector: vertical.name,
        teamSize: 8 + Math.floor(Math.random() * 12),
        description: `${d.startup} is building solutions in the ${vertical.name} space.`,
        fundingAsk: BigInt(d.askLakhs) * BigInt(10_000_000),
        loanType: d.loanType,
        tenureMonths: d.loanType === "equity" ? null : 36,
        purpose: "Working capital + product development",
        status: "converted",
      },
    });

    await prisma.vCDeal.upsert({
      where: { applicationId: application.id },
      update: { currentStage: d.stage, aiScore: d.aiScore ?? null },
      create: {
        tenantId: tenant.id,
        applicationId: application.id,
        verticalId: vertical.id,
        currentStage: d.stage,
        analystId: userIds["analyst"],
        partnerId: userIds["partner"],
        aiScore: d.aiScore ?? null,
        docCompleteness: ["intake", "onboarding"].includes(d.stage) ? 25 : 80,
      },
    });
  }
  console.log(`  ✓ ${DEMO_DEALS.length} demo deals across stages`);

  console.log("✅ QuikVC seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
