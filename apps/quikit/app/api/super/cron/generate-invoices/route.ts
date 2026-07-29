/**
 * SA-A.7 — Monthly invoice generator (dummy billing, pre-Stripe).
 *
 * Runs on the 1st of each month. For every active tenant:
 *   1. Looks up the tenant's plan (by Tenant.plan slug → Plan.priceMonthly)
 *   2. Creates a pending Invoice for the just-ended month
 *   3. Phase B UI lets a super admin "Mark paid" / "Mark failed" via two buttons
 *
 * Idempotent by (orgId, periodStart): re-running for the same month won't
 * duplicate invoices.
 *
 * This is NOT real billing — no Stripe, no tax, no proration. Its purpose is
 * to populate the Invoice table so the analytics narrative engine ("March:
 * $X revenue, +N tenants, M paid / K trial") has data to speak about.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCron } from "@/lib/requireCron";

function firstOfPrevMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
}
function firstOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const blocked = requireCron(req);
  if (blocked) return blocked;

  const now = new Date();
  const periodStart = firstOfPrevMonthUTC(now);
  const periodEnd = firstOfMonthUTC(now); // exclusive end = start of current month

  try {
    const tenants = await db.org.findMany({
      where: { status: "active" },
      select: { id: true, plan: true, name: true },
    });

    // Look up plan prices once
    const planSlugs = [...new Set(tenants.map((t) => t.plan))];
    const plans = await db.plan.findMany({
      where: { slug: { in: planSlugs } },
      select: { slug: true, priceMonthly: true, currency: true },
    });
    const planMap = new Map(plans.map((p) => [p.slug, p]));

    let created = 0;
    let skipped = 0;
    const missingPlans = new Set<string>();

    for (const t of tenants) {
      const plan = planMap.get(t.plan);
      if (!plan) {
        // Tenant points at a plan slug not in the Plan table — skip but record
        // so we can surface a warning to the super admin.
        missingPlans.add(t.plan);
        skipped += 1;
        continue;
      }

      // Idempotency: check for existing invoice in this period
      const existing = await db.invoice.findFirst({
        where: { orgId: t.id, periodStart, periodEnd },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await db.invoice.create({
        data: {
          orgId: t.id,
          planSlug: t.plan,
          amountCents: plan.priceMonthly,
          currency: plan.currency,
          status: "pending",
          periodStart,
          periodEnd,
          notes: `Auto-generated for ${t.name} — ${t.plan} plan`,
        },
      });
      created += 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        tenantsProcessed: tenants.length,
        invoicesCreated: created,
        invoicesSkipped: skipped,
        missingPlans: Array.from(missingPlans),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invoice generation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
