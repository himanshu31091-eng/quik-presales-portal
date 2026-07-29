/**
 * SA-C.1 — Super admin overview analytics.
 *
 * Returns a single JSON blob the /analytics dashboard renders as cards.
 * Everything here is computed from data captured in Phase A — no external
 * services, no mocked values.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { cacheOrCompute } from "@quikit/shared/redisCache";

const CACHE_KEY = "super:analytics:overview";
const CACHE_TTL_SECONDS = 60;

async function computeOverview() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const [
      tenantCount,
      activeTenantCount,
      userCount,
      appCount,
      recentHealth,
      apiCalls7d,
      apiErrors7d,
      dailySessions30d,
      currentMonthInvoices,
      prevMonthInvoices,
      tenantsNeverLoggedIn,
      mostActiveTenants,
    ] = await Promise.all([
      db.org.count(),
      db.org.count({ where: { status: "active" } }),
      db.user.count(),
      db.app.count({ where: { status: "active" } }),
      // latest 1 probe per app
      db.appHealthCheck.findMany({
        where: { checkedAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
        orderBy: { checkedAt: "desc" },
        take: 200,
      }),
      db.apiCall.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      db.apiCall.count({ where: { createdAt: { gte: sevenDaysAgo }, statusCode: { gte: 400 } } }),
      db.sessionEvent.findMany({
        where: { event: "login", createdAt: { gte: thirtyDaysAgo } },
        select: { userId: true, createdAt: true },
      }),
      db.invoice.findMany({
        where: { periodStart: { gte: startOfMonth } },
        select: { amountCents: true, status: true },
      }),
      db.invoice.findMany({
        where: { periodStart: { gte: startOfPrevMonth, lt: startOfMonth } },
        select: { amountCents: true, status: true },
      }),
      db.org.findMany({
        where: {
          status: "active",
          users: { none: { user: { lastSignInAt: { not: null } } } },
        },
        select: { id: true, name: true, createdAt: true },
        take: 20,
      }),
      db.sessionEvent.groupBy({
        by: ["orgId"],
        where: { event: "login", createdAt: { gte: thirtyDaysAgo }, orgId: { not: null } },
        _count: { userId: true },
        orderBy: { _count: { userId: "desc" } },
        take: 5,
      }),
    ]);

    // App uptime: collapse latest probe per app to a status bucket
    const latestByApp = new Map<string, { appId: string; status: string; statusCode: number | null }>();
    for (const p of recentHealth) {
      if (!latestByApp.has(p.appId)) latestByApp.set(p.appId, p);
    }
    const appsUp = [...latestByApp.values()].filter((p) => p.status === "up").length;
    const appsDown = [...latestByApp.values()].filter((p) => p.status === "down").length;
    const appsDegraded = [...latestByApp.values()].filter((p) => p.status === "degraded").length;
    const appsUnknown = appCount - latestByApp.size;

    // DAU-ish: distinct users per day
    const dailyMap = new Map<string, Set<string>>();
    for (const s of dailySessions30d) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(day)) dailyMap.set(day, new Set());
      dailyMap.get(day)!.add(s.userId);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, set]) => ({ date, activeUsers: set.size }));

    // Revenue
    const mrrCents = currentMonthInvoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const prevMrrCents = prevMonthInvoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const mrrPending = currentMonthInvoices
      .filter((i) => i.status === "pending")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const mrrFailedCents = currentMonthInvoices
      .filter((i) => i.status === "failed")
      .reduce((sum, i) => sum + i.amountCents, 0);

    const mrrDeltaPct = prevMrrCents > 0 ? ((mrrCents - prevMrrCents) / prevMrrCents) * 100 : null;

    // Narrative generator — one short sentence summarizing the month
    let narrative: string;
    if (mrrCents === 0 && prevMrrCents === 0) {
      narrative = "No paid revenue yet this period — focus on converting pending invoices.";
    } else if (mrrDeltaPct === null) {
      narrative = `First month with paid revenue: $${(mrrCents / 100).toFixed(2)} across ${currentMonthInvoices.filter((i) => i.status === "paid").length} invoices.`;
    } else if (mrrDeltaPct > 5) {
      narrative = `Revenue up ${mrrDeltaPct.toFixed(1)}% month-over-month to $${(mrrCents / 100).toFixed(2)} MRR.`;
    } else if (mrrDeltaPct < -5) {
      narrative = `Revenue down ${Math.abs(mrrDeltaPct).toFixed(1)}% MoM — check failed invoices ($${(mrrFailedCents / 100).toFixed(2)}) for recovery.`;
    } else {
      narrative = `Revenue roughly flat MoM at $${(mrrCents / 100).toFixed(2)} MRR.`;
    }

    // Alert surface — simple rules at this stage
    const alerts: Array<{ severity: "info" | "warning" | "critical"; message: string }> = [];
    if (appsDown > 0) alerts.push({ severity: "critical", message: `${appsDown} app${appsDown === 1 ? "" : "s"} down right now` });
    if (mrrFailedCents > 0) alerts.push({ severity: "warning", message: `$${(mrrFailedCents / 100).toFixed(2)} in failed invoices this month` });
    if (tenantsNeverLoggedIn.length > 0) alerts.push({ severity: "info", message: `${tenantsNeverLoggedIn.length} tenants have never logged in` });
    const errorRate = apiCalls7d > 0 ? (apiErrors7d / apiCalls7d) * 100 : 0;
    if (errorRate > 5) alerts.push({ severity: "warning", message: `API error rate ${errorRate.toFixed(1)}% over last 7 days` });

    return {
      tenantCount,
      activeTenantCount,
      userCount,
      appCount,
      uptime: {
        up: appsUp,
        down: appsDown,
        degraded: appsDegraded,
        unknown: appsUnknown,
      },
      api: {
        calls7d: apiCalls7d,
        errors7d: apiErrors7d,
        errorRatePct: Number(errorRate.toFixed(2)),
      },
      engagement: {
        dailyTrend, // [{date, activeUsers}]
        mostActiveOrgIds: mostActiveTenants.map((t) => ({ orgId: t.orgId, sessionCount: t._count.userId })),
        inactiveTenants: tenantsNeverLoggedIn.slice(0, 10).map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt.toISOString() })),
      },
      revenue: {
        mrrCents,
        mrrDollars: (mrrCents / 100).toFixed(2),
        prevMrrDollars: (prevMrrCents / 100).toFixed(2),
        mrrDeltaPct: mrrDeltaPct === null ? null : Number(mrrDeltaPct.toFixed(1)),
        pendingCents: mrrPending,
        failedCents: mrrFailedCents,
        narrative,
      },
      alerts,
    };
}

export const GET = withSuperAdminAuth(async () => {
  try {
    const data = await cacheOrCompute(CACHE_KEY, CACHE_TTL_SECONDS, computeOverview);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load overview";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
