import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, validationError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { cacheOrCompute } from "@quikit/shared/redisCache";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { PRACTICES, practiceOf, spansMultiplePractices } from "@/lib/practices";

const withDashboardAuth = withOrgAuthForModule("dashboard");

const query = z.object({
  /** Trailing window for "created this period" counters. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * Short TTL: the dashboard is the first thing users land on, so it must be
 * fast, but a stale pipeline for minutes would undermine trust in the numbers.
 * 60s is long enough to absorb a page refresh loop.
 */
const CACHE_TTL = 60;

/**
 * GET /api/dashboard — executive KPI cards, pipeline board, recent activity.
 *
 * All aggregates run in one `Promise.all` so the page is a single round trip.
 * Cached in Redis per (org, window); Redis failures fall through to a live read
 * rather than erroring the page.
 */
export const GET = withDashboardAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { days } = parsed.data;

  const data = await cacheOrCompute(`ps:dashboard:${orgId}:${days}`, CACHE_TTL, async () => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    /** Start of the equal-length window immediately before `since`. */
    const previousSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
    const openEngagements = { orgId, deletedAt: null, closedStatus: "open" };

    const [
      byStage,
      pipelineValue,
      wonCount,
      lostCount,
      openRfps,
      proposalsByStatus,
      demoStats,
      assetCounts,
      newThisPeriod,
      dealHealth,
      recentActivity,
      practiceRows,
      upcomingCloses,
    ] = await Promise.all([
      // Grouped by stage AND currency. estRevenue is an integer count of minor
      // units, so summing across currencies adds paise to cents and produces a
      // meaningless figure — the client converts each bucket before totalling.
      db.psEngagement.groupBy({
        by: ["stage", "currency"],
        where: openEngagements,
        _count: true,
        _sum: { estRevenue: true },
      }),
      db.psEngagement.groupBy({
        by: ["currency"],
        where: openEngagements,
        _sum: { estRevenue: true },
      }),
      db.psEngagement.count({ where: { orgId, deletedAt: null, closedStatus: "won" } }),
      db.psEngagement.count({ where: { orgId, deletedAt: null, closedStatus: "lost" } }),
      db.psRfp.count({ where: { orgId, status: { notIn: ["submitted"] } } }),
      db.psProposal.groupBy({ by: ["status"], where: { orgId }, _count: true }),
      db.psDemo.aggregate({
        where: { orgId, deletedAt: null, NOT: { feedbackScore: null } },
        _avg: { feedbackScore: true },
        _count: true,
      }),
      Promise.all([
        db.psTemplate.count({ where: { orgId, deletedAt: null } }),
        db.psDemo.count({ where: { orgId, deletedAt: null } }),
        db.psKnowledgeAsset.count({ where: { orgId, deletedAt: null } }),
      ]),
      Promise.all([
        db.psEngagement.count({ where: { orgId, deletedAt: null, createdAt: { gte: since } } }),
        db.psProposal.count({ where: { orgId, createdAt: { gte: since } } }),
        db.psRfp.count({ where: { orgId, createdAt: { gte: since } } }),
        // The preceding window of equal length, for the "vs last period" deltas.
        // Only FLOW metrics get a comparison: how many things were created in each
        // window is genuinely computable. Snapshot metrics (open count, pipeline
        // value, win rate) would need historical snapshots nobody records, and a
        // fabricated trend arrow on a leadership dashboard is worse than none.
        db.psEngagement.count({
          where: { orgId, deletedAt: null, createdAt: { gte: previousSince, lt: since } },
        }),
        db.psProposal.count({
          where: { orgId, createdAt: { gte: previousSince, lt: since } },
        }),
        db.psRfp.count({ where: { orgId, createdAt: { gte: previousSince, lt: since } } }),
      ]),
      db.psEngagement.groupBy({
        by: ["aiDealHealth"],
        where: { ...openEngagements, NOT: { aiDealHealth: null } },
        _count: true,
      }),
      db.psTimelineEvent.findMany({
        where: { orgId },
        select: {
          id: true,
          type: true,
          summary: true,
          actorId: true,
          createdAt: true,
          engagement: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      // Practice is derived from techStack until PsEngagement gains a `practice`
      // column, so it cannot be grouped in SQL — fetch the open deals and bucket
      // them in memory. Bounded by the open pipeline, which is small.
      db.psEngagement.findMany({
        where: openEngagements,
        select: { techStack: true, estRevenue: true, currency: true },
      }),
      db.psEngagement.findMany({
        where: { ...openEngagements, expectedClose: { not: null, gte: new Date() } },
        // currency travels with the amount — a bare estRevenue cannot be rendered
        // or converted correctly on its own.
        select: {
          id: true,
          title: true,
          stage: true,
          estRevenue: true,
          currency: true,
          expectedClose: true,
        },
        orderBy: { expectedClose: "asc" },
        take: 8,
      }),
    ]);

    // Per stage: a total count plus one money bucket per currency present. The
    // client converts and totals, because only it knows the chosen display
    // currency.
    const stageBuckets = new Map<string, { count: number; money: { currency: string; minorUnits: string }[] }>();
    for (const row of byStage) {
      const entry = stageBuckets.get(row.stage) ?? { count: 0, money: [] };
      entry.count += row._count;
      const minor = row._sum.estRevenue;
      if (minor !== null && minor !== 0n) {
        entry.money.push({ currency: row.currency ?? "INR", minorUnits: minor.toString() });
      }
      stageBuckets.set(row.stage, entry);
    }
    const [templates, demos, knowledge] = assetCounts;
    const [newEngagements, newProposals, newRfps, prevEngagements, prevProposals, prevRfps] =
      newThisPeriod;

    /**
     * Pipeline value grouped by delivery practice, one money bucket per currency
     * within each practice — the client converts and totals, as it does elsewhere.
     *
     * `derived: true` is reported so the UI can say so. Practice is inferred from
     * technology today; once PsEngagement carries a real column this flips to
     * false and the caveat disappears from the panel.
     */
    const practiceBuckets = new Map<string, { currency: string; minorUnits: bigint }[]>();
    let practiceDealCount = 0;
    let multiPracticeDeals = 0;

    for (const row of practiceRows) {
      const practice = practiceOf(row.techStack);
      if (spansMultiplePractices(row.techStack)) multiPracticeDeals += 1;
      if (row.estRevenue === null || row.estRevenue === 0n) continue;

      practiceDealCount += 1;
      const currency = row.currency ?? "INR";
      const existing = practiceBuckets.get(practice) ?? [];
      const bucket = existing.find((b) => b.currency === currency);
      if (bucket) bucket.minorUnits += row.estRevenue;
      else existing.push({ currency, minorUnits: row.estRevenue });
      practiceBuckets.set(practice, existing);
    }

    /**
     * Percentage change against the previous window.
     *
     * Returns null rather than a number when the previous window was zero: "up
     * from nothing" has no meaningful percentage, and rendering ∞ or a bare 100%
     * misleads. The UI shows "new" in that case.
     */
    const deltaPct = (current: number, previous: number): number | null =>
      previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

    const closed = wonCount + lostCount;

    return {
      kpis: {
        activeEngagements: byStage.reduce((sum, r) => sum + r._count, 0),
        // One bucket per currency in the open pipeline. The client converts these
        // into the display currency it is showing; there is no single correct
        // scalar to send here.
        pipelineByCurrency: pipelineValue
          .filter((r) => r._sum.estRevenue !== null && r._sum.estRevenue !== 0n)
          .map((r) => ({
            currency: r.currency ?? "INR",
            minorUnits: (r._sum.estRevenue ?? 0n).toString(),
          })),
        openRfps,
        // Guard the divide — an org with no closed deals should show null, not NaN.
        winRatePct: closed > 0 ? Math.round((wonCount / closed) * 100) : null,
        demoSatisfaction: demoStats._avg.feedbackScore
          ? Number(demoStats._avg.feedbackScore.toFixed(2))
          : null,
        ratedDemos: demoStats._count,
        // The "100+ reusable assets" target from the mandate.
        reusableAssets: templates + demos + knowledge,
      },
      pipeline: ACTIVE_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABEL[stage as Stage],
        count: stageBuckets.get(stage)?.count ?? 0,
        money: stageBuckets.get(stage)?.money ?? [],
      })),
      proposals: Object.fromEntries(proposalsByStatus.map((r) => [r.status, r._count])),
      dealHealth: Object.fromEntries(
        dealHealth.map((r) => [r.aiDealHealth ?? "unknown", r._count]),
      ),
      assets: { templates, demos, knowledge },
      thisPeriod: { days, newEngagements, newProposals, newRfps },
      /**
       * Flow metrics with a real previous-window comparison. Deliberately does not
       * include open count, pipeline value or win rate — those are snapshots, and
       * comparing them needs history this app does not keep.
       */
      practicePipeline: {
        /** Practice is inferred from technology, not stored. Surfaced so the UI says so. */
        derived: true,
        dealsWithValue: practiceDealCount,
        /** Deals whose technologies span practices, attributed to just one. */
        multiPracticeDeals,
        rows: PRACTICES.filter((p) => practiceBuckets.has(p)).map((practice) => ({
          practice,
          money: (practiceBuckets.get(practice) ?? []).map((b) => ({
            currency: b.currency,
            minorUnits: b.minorUnits.toString(),
          })),
        })),
      },
      trends: {
        newEngagements: {
          current: newEngagements,
          previous: prevEngagements,
          deltaPct: deltaPct(newEngagements, prevEngagements),
        },
        newProposals: {
          current: newProposals,
          previous: prevProposals,
          deltaPct: deltaPct(newProposals, prevProposals),
        },
        newRfps: {
          current: newRfps,
          previous: prevRfps,
          deltaPct: deltaPct(newRfps, prevRfps),
        },
      },
      upcomingCloses: upcomingCloses.map((e) => ({
        ...e,
        estRevenue: e.estRevenue?.toString() ?? null,
        expectedClose: e.expectedClose?.toISOString() ?? null,
      })),
      recentActivity: recentActivity.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  return okSerialized(data);
});
