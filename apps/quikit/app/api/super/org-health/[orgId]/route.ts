/**
 * SA-B.5 — Organization health snapshot.
 *
 * Returns a single JSON blob the org detail page renders as a "how is
 * this customer doing" panel. Combines data from:
 *   - Membership / User  → member count, last login
 *   - SessionEvent       → active-user count in the last 7 days
 *   - KPI                → KPIs logged this week (proxy for engagement)
 *   - AppModuleFlag      → how many modules disabled
 *   - TenantAppAccess    → how many apps fully blocked
 *   - Invoice            → last invoice status
 *
 * None of this is speculative: it's data we already capture via SA-A.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { cacheOrCompute } from "@quikit/shared/redisCache";

const CACHE_TTL_SECONDS = 60;

async function computeTenantHealth(orgId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay());
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, plan: true, status: true, createdAt: true },
    });
    if (!org) return null;

    const [
      memberCount,
      activeUserCount,
      lastLoginEvent,
      kpiCount,
      kpisLoggedThisWeek,
      disabledModuleCount,
      blockedAppCount,
      lastInvoice,
      apiCallCount7d,
      sessionsLast30d,
    ] = await Promise.all([
      db.orgMember.count({ where: { orgId, status: "active" } }),
      // distinct userIds seen in SessionEvent in last 7 days
      db.sessionEvent.findMany({
        where: { orgId, event: "login", createdAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      }).then((rows) => rows.length),
      db.sessionEvent.findFirst({
        where: { orgId, event: "login" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, userId: true },
      }),
      db.kPI.count({ where: { orgId } }),
      db.kPIWeeklyValue.count({
        where: { kpi: { orgId }, updatedAt: { gte: startOfWeek } },
      }),
      db.appModuleFlag.count({ where: { orgId, enabled: false } }),
      db.orgAppAccess.count({ where: { orgId, enabled: false } }),
      db.invoice.findFirst({
        where: { orgId },
        orderBy: { periodStart: "desc" },
        select: { status: true, amountCents: true, currency: true, periodStart: true, paidAt: true, failedAt: true },
      }),
      db.apiCall.count({ where: { orgId, createdAt: { gte: sevenDaysAgo } } }),
      db.sessionEvent.count({ where: { orgId, event: "login", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    // Health score: a simple 0-100 roll-up for at-a-glance triage.
    // - 40 pts: has any session in last 7d
    // - 30 pts: > 0 KPIs logged this week
    // - 20 pts: last invoice paid
    // - 10 pts: < 3 modules disabled
    let healthScore = 0;
    if (activeUserCount > 0) healthScore += 40;
    if (kpisLoggedThisWeek > 0) healthScore += 30;
    if (lastInvoice?.status === "paid") healthScore += 20;
    if (disabledModuleCount < 3) healthScore += 10;

    return {
      org,
      healthScore,
      signals: {
        memberCount,
        activeUserCount7d: activeUserCount,
        kpiCount,
        kpisLoggedThisWeek,
        disabledModuleCount,
        blockedAppCount,
        apiCallCount7d,
        sessionsLast30d,
        lastLoginAt: lastLoginEvent?.createdAt?.toISOString() ?? null,
        lastLoginUserId: lastLoginEvent?.userId ?? null,
        lastInvoice: lastInvoice
          ? {
              status: lastInvoice.status,
              amountCents: lastInvoice.amountCents,
              amountDollars: (lastInvoice.amountCents / 100).toFixed(2),
              currency: lastInvoice.currency,
              periodStart: lastInvoice.periodStart.toISOString(),
              paidAt: lastInvoice.paidAt?.toISOString() ?? null,
              failedAt: lastInvoice.failedAt?.toISOString() ?? null,
            }
          : null,
      },
    };
}

export const GET = withSuperAdminAuth<{ orgId: string }>(async (_auth, _req, { params }) => {
  try {
    const orgId = params.orgId;
    const cacheKey = `super:org-health:${orgId}`;
    const data = await cacheOrCompute(cacheKey, CACHE_TTL_SECONDS, () => computeTenantHealth(orgId));
    if (!data) {
      return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load org health";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
