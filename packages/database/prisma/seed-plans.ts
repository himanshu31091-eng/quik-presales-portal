/**
 * Seed the default subscription Plan rows (startup / growth / enterprise).
 *
 * Run: cd packages/database && npx tsx prisma/seed-plans.ts
 *   or: npm run db:seed:plans
 *
 * Idempotent — upserts by slug, so re-running never duplicates and never
 * clobbers fields you didn't list. Prices are in cents (the /pricing UI
 * divides by 100). Slugs align with TENANT_PLANS / Subscription.planSlug.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    slug: "startup",
    name: "Startup",
    description: "Small teams getting started",
    priceMonthly: 0,
    priceYearly: 0,
    features: ["basic_kpis", "email_support"],
    limits: { maxUsers: 5, maxKPIs: 20, maxApps: 1 },
    sortOrder: 0,
  },
  {
    slug: "growth",
    name: "Growth",
    description: "Scaling organizations with multi-app access",
    priceMonthly: 9900,
    priceYearly: 99000,
    features: ["unlimited_kpis", "priority_support", "analytics"],
    limits: { maxUsers: 50, maxKPIs: 500, maxApps: 3 },
    sortOrder: 10,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Large organizations with compliance requirements",
    priceMonthly: 49900,
    priceYearly: 499000,
    features: ["unlimited_kpis", "priority_support", "analytics", "sso", "audit_export"],
    limits: { maxUsers: -1, maxKPIs: -1, maxApps: -1 },
    sortOrder: 20,
  },
] as const;

async function main() {
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        features: [...p.features],
        limits: p.limits,
        isActive: true,
        sortOrder: p.sortOrder,
      },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        currency: "USD",
        features: [...p.features],
        limits: p.limits,
        isActive: true,
        sortOrder: p.sortOrder,
      },
    });
    console.log(`[seed-plans] upserted plan: ${p.slug}`);
  }
}

main()
  .catch((e) => {
    console.error("[seed-plans] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
