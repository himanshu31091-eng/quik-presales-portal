/**
 * SA-C.2 — Per-org analytics.
 *
 * Returns trendlines and usage breakdowns for one org, pulled from
 * SessionEvent + ApiCallHourlyRollup. Drives the analytics tab on the
 * org detail page.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";

export const GET = withSuperAdminAuth<{ orgId: string }>(async (_auth, _req, { params }) => {
  try {
    const orgId = params.orgId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, plan: true, createdAt: true },
    });
    if (!org) return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });

    const [sessionEvents, rollups, appAccess, moduleFlags, kpiCount, invoices] = await Promise.all([
      db.sessionEvent.findMany({
        where: { orgId, event: "login", createdAt: { gte: thirtyDaysAgo } },
        select: { userId: true, createdAt: true },
      }),
      // Exclude the _global_ sentinel from per-org views
      db.apiCallHourlyRollup.findMany({
        where: { orgId, NOT: { orgId: "_global_" }, hourBucket: { gte: thirtyDaysAgo } },
        select: {
          hourBucket: true,
          pathPattern: true,
          statusClass: true,
          callCount: true,
          errorCount: true,
          totalDurationMs: true,
          maxDurationMs: true,
        },
      }),
      db.orgAppAccess.findMany({
        where: { orgId, enabled: false },
        include: { app: { select: { slug: true, name: true } } },
      }),
      db.appModuleFlag.findMany({
        where: { orgId, enabled: false },
        include: { app: { select: { slug: true } } },
      }),
      db.kPI.count({ where: { orgId } }),
      db.invoice.findMany({
        where: { orgId },
        orderBy: { periodStart: "desc" },
        take: 12,
        select: { amountCents: true, status: true, periodStart: true },
      }),
    ]);

    // DAU trend
    const dauMap = new Map<string, Set<string>>();
    for (const s of sessionEvents) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!dauMap.has(day)) dauMap.set(day, new Set());
      dauMap.get(day)!.add(s.userId);
    }
    const dailyTrend = Array.from(dauMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, set]) => ({ date, activeUsers: set.size }));

    // Top endpoints by call count
    type EndpointAgg = { pathPattern: string; calls: number; errors: number; avgMs: number };
    const endpointMap = new Map<string, { calls: number; errors: number; durationMs: bigint }>();
    for (const r of rollups) {
      const cur = endpointMap.get(r.pathPattern) ?? { calls: 0, errors: 0, durationMs: BigInt(0) };
      cur.calls += r.callCount;
      cur.errors += r.errorCount;
      cur.durationMs += r.totalDurationMs;
      endpointMap.set(r.pathPattern, cur);
    }
    const topEndpoints: EndpointAgg[] = Array.from(endpointMap.entries())
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 10)
      .map(([path, v]) => ({
        pathPattern: path,
        calls: v.calls,
        errors: v.errors,
        avgMs: v.calls > 0 ? Number(v.durationMs / BigInt(v.calls)) : 0,
      }));

    // Total calls + error rate
    const totalCalls = rollups.reduce((s, r) => s + r.callCount, 0);
    const totalErrors = rollups.reduce((s, r) => s + r.errorCount, 0);

    // Paid-vs-failed ratio over last 12 invoices
    const invoicesPaidCents = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
    const invoicesFailedCents = invoices.filter((i) => i.status === "failed").reduce((s, i) => s + i.amountCents, 0);
    const invoicesPendingCents = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + i.amountCents, 0);

    return NextResponse.json({
      success: true,
      data: {
        org,
        windowDays: 30,
        dauTrend: dailyTrend,
        api: {
          totalCalls,
          totalErrors,
          errorRatePct: totalCalls > 0 ? Number(((totalErrors / totalCalls) * 100).toFixed(2)) : 0,
          topEndpoints,
        },
        gates: {
          blockedApps: appAccess.map((a) => ({ slug: a.app.slug, name: a.app.name, reason: a.reason })),
          disabledModules: moduleFlags.map((m) => ({ appSlug: m.app.slug, moduleKey: m.moduleKey })),
        },
        usage: {
          kpiCount,
        },
        billing: {
          invoicesPaidDollars: (invoicesPaidCents / 100).toFixed(2),
          invoicesFailedDollars: (invoicesFailedCents / 100).toFixed(2),
          invoicesPendingDollars: (invoicesPendingCents / 100).toFixed(2),
          recentInvoices: invoices.map((i) => ({
            amountDollars: (i.amountCents / 100).toFixed(2),
            status: i.status,
            periodStart: i.periodStart.toISOString(),
          })),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load org analytics";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
