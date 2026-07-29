/**
 * SA-B.3 — List invoices for a org + create one manually.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth<{ orgId: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const org = await db.org.findUnique({
      where: { id: params.orgId },
      select: { id: true, name: true, plan: true },
    });
    if (!org) return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });

    const invoices = await db.invoice.findMany({
      where: { orgId: params.orgId },
      orderBy: { periodStart: "desc" },
      take: 24, // last 24 months
    });

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.total += inv.amountCents;
        if (inv.status === "paid") acc.paid += inv.amountCents;
        else if (inv.status === "failed") acc.failed += inv.amountCents;
        else if (inv.status === "pending") acc.pending += inv.amountCents;
        return acc;
      },
      { total: 0, paid: 0, failed: 0, pending: 0 },
    );

    return NextResponse.json({
      success: true,
      data: {
        org,
        invoices: invoices.map((inv) => ({
          ...inv,
          amountDollars: (inv.amountCents / 100).toFixed(2),
          periodStart: inv.periodStart.toISOString(),
          periodEnd: inv.periodEnd.toISOString(),
          paidAt: inv.paidAt?.toISOString() ?? null,
          failedAt: inv.failedAt?.toISOString() ?? null,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
        })),
        totals: {
          ...totals,
          totalDollars: (totals.total / 100).toFixed(2),
          paidDollars: (totals.paid / 100).toFixed(2),
          failedDollars: (totals.failed / 100).toFixed(2),
          pendingDollars: (totals.pending / 100).toFixed(2),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load invoices";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/** Manually generate an invoice for a org (e.g. to backfill a period). */
export const POST = withSuperAdminAuth<{ orgId: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const org = await db.org.findUnique({
      where: { id: params.orgId },
      select: { id: true, plan: true, name: true },
    });
    if (!org) return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });

    const plan = await db.plan.findUnique({ where: { slug: org.plan } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: `Organization's plan "${org.plan}" is not defined in the Plan table` },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const periodStart = body.periodStart ? new Date(body.periodStart) : new Date();
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await db.invoice.create({
      data: {
        orgId: params.orgId,
        planSlug: plan.slug,
        amountCents: plan.priceMonthly,
        currency: plan.currency,
        status: "pending",
        periodStart,
        periodEnd,
        notes: body.notes ?? `Manual invoice for ${org.name}`,
      },
    });

    logAudit({
      orgId: params.orgId,
      actorId: auth.userId,
      action: "CREATE",
      entityType: "Invoice",
      entityId: invoice.id,
      newValues: JSON.stringify({ planSlug: plan.slug, amountCents: plan.priceMonthly, periodStart, periodEnd }),
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
