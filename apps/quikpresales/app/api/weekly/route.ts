import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, validationError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { cacheOrCompute } from "@quikit/shared/redisCache";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";

const withDashboardAuth = withOrgAuthForModule("weekly");

const query = z.object({
  /** Any date inside the target week (ISO). Defaults to the current week. */
  weekOf: z.string().datetime().optional(),
});

const CACHE_TTL = 300;

/** Monday 00:00 UTC for the week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * RAG status for a metric. Thresholds are the KPI targets from the business
 * mandate (§2 of the PRD) — TAT under 24h, demo satisfaction ≥ 4.8, etc.
 */
function rag(value: number | null, green: number, amber: number, higherIsBetter = true): "green" | "amber" | "red" | "na" {
  if (value === null) return "na";
  if (higherIsBetter) {
    if (value >= green) return "green";
    return value >= amber ? "amber" : "red";
  }
  if (value <= green) return "green";
  return value <= amber ? "amber" : "red";
}

/**
 * GET /api/weekly — the weekly executive report (PRD §14).
 *
 * Computed on the fly with a 5-minute cache rather than snapshotted nightly:
 * the report is read a handful of times a week, so a cron job plus a snapshot
 * table would be more moving parts than the query costs. If read volume grows,
 * this is the place to swap in a materialised snapshot.
 */
export const GET = withDashboardAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const anchor = parsed.data.weekOf ? new Date(parsed.data.weekOf) : new Date();
  const weekStart = startOfWeek(anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const key = `ps:weekly:${orgId}:${weekStart.toISOString().slice(0, 10)}`;

  const data = await cacheOrCompute(key, CACHE_TTL, async () => {
    const inWeek = { gte: weekStart, lt: weekEnd };

    const [
      newEngagements,
      eventCounts,
      proposalsCreated,
      proposalsApproved,
      proposalSources,
      demosByTech,
      assetsCreated,
      winLoss,
      pipeline,
      rfpsDue,
    ] = await Promise.all([
      db.psEngagement.count({ where: { orgId, deletedAt: null, createdAt: inWeek } }),
      db.psTimelineEvent.groupBy({ by: ["type"], where: { orgId, createdAt: inWeek }, _count: true }),
      db.psProposal.count({ where: { orgId, createdAt: inWeek } }),
      db.psProposal.findMany({
        where: { orgId, approvedAt: inWeek },
        select: { createdAt: true, approvedAt: true },
      }),
      db.psProposalVersion.groupBy({
        by: ["source"],
        where: { orgId, createdAt: inWeek },
        _count: true,
      }),
      db.psDemo.groupBy({
        by: ["technology"],
        where: { orgId, deletedAt: null },
        _count: true,
        _avg: { feedbackScore: true },
      }),
      Promise.all([
        db.psTemplate.count({ where: { orgId, deletedAt: null, createdAt: inWeek } }),
        db.psDemo.count({ where: { orgId, deletedAt: null, createdAt: inWeek } }),
        db.psKnowledgeAsset.count({ where: { orgId, deletedAt: null, createdAt: inWeek } }),
      ]),
      db.psWinLoss.findMany({
        where: { orgId, createdAt: inWeek },
        select: {
          outcome: true,
          competitor: true,
          reasonCategory: true,
          dealSize: true,
          engagement: { select: { title: true } },
        },
      }),
      db.psEngagement.groupBy({
        by: ["stage"],
        where: { orgId, deletedAt: null, closedStatus: "open" },
        _count: true,
        _sum: { estRevenue: true },
      }),
      db.psRfp.count({
        where: { orgId, dueDate: inWeek, status: { notIn: ["submitted"] } },
      }),
    ]);

    const eventMap = Object.fromEntries(eventCounts.map((e) => [e.type, e._count]));

    // Turnaround = created → approved, in hours. Only proposals approved this
    // week contribute; an un-approved proposal has no TAT yet.
    const tatHours = proposalsApproved
      .filter((p) => p.approvedAt)
      .map((p) => (p.approvedAt!.getTime() - p.createdAt.getTime()) / 3_600_000);

    const avgTat = tatHours.length
      ? Number((tatHours.reduce((a, b) => a + b, 0) / tatHours.length).toFixed(1))
      : null;
    const fastestTat = tatHours.length ? Number(Math.min(...tatHours).toFixed(1)) : null;
    const within24h = tatHours.filter((h) => h <= 24).length;
    const tatCompliancePct = tatHours.length
      ? Math.round((within24h / tatHours.length) * 100)
      : null;

    const aiVersions = proposalSources
      .filter((s) => s.source === "claude" || s.source === "claude-section")
      .reduce((sum, s) => sum + s._count, 0);
    const manualVersions = proposalSources
      .filter((s) => s.source === "edit")
      .reduce((sum, s) => sum + s._count, 0);
    const totalVersions = aiVersions + manualVersions;

    const [newTemplates, newDemos, newKnowledge] = assetsCreated;
    const won = winLoss.filter((w) => w.outcome === "won").length;
    const lost = winLoss.filter((w) => w.outcome === "lost").length;
    const weekWinRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

    const avgDemoScore = demosByTech.length
      ? demosByTech.reduce((sum, d) => sum + (d._avg.feedbackScore ?? 0), 0) /
        demosByTech.filter((d) => d._avg.feedbackScore !== null).length
      : null;

    const aiAdoptionPct = totalVersions > 0 ? Math.round((aiVersions / totalVersions) * 100) : null;

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),

      activity: {
        newEngagementsSupported: newEngagements,
        discoveryCalls: eventMap["stage-advanced"] ?? 0,
        demosDelivered: eventMap["demo-delivered"] ?? 0,
        proposalsCreated,
        proposalsApproved: proposalsApproved.length,
        rfpsExtracted: eventMap["rfp-extracted"] ?? 0,
        rfpsDueThisWeek: rfpsDue,
      },

      turnaround: {
        avgHours: avgTat,
        fastestHours: fastestTat,
        delayedCount: tatHours.filter((h) => h > 24).length,
        within24hPct: tatCompliancePct,
      },

      aiUsage: {
        aiGeneratedVersions: aiVersions,
        manualVersions,
        adoptionPct: aiAdoptionPct,
      },

      pipeline: ACTIVE_STAGES.map((stage) => {
        const row = pipeline.find((p) => p.stage === stage);
        return {
          stage,
          label: STAGE_LABEL[stage as Stage],
          count: row?._count ?? 0,
          value: (row?._sum.estRevenue ?? 0n).toString(),
        };
      }),

      demoPerformance: demosByTech.map((d) => ({
        technology: d.technology,
        count: d._count,
        avgScore: d._avg.feedbackScore ? Number(d._avg.feedbackScore.toFixed(2)) : null,
      })),

      assetsCreated: {
        templates: newTemplates,
        demos: newDemos,
        knowledge: newKnowledge,
        total: newTemplates + newDemos + newKnowledge,
      },

      winLoss: {
        won,
        lost,
        winRatePct: weekWinRate,
        records: winLoss.map((w) => ({
          engagement: w.engagement.title,
          outcome: w.outcome,
          competitor: w.competitor,
          reasonCategory: w.reasonCategory,
          dealSize: w.dealSize?.toString() ?? null,
        })),
      },

      // The RAG board from the weekly report format. `na` where there's no
      // data yet — an empty week should not render as red.
      ragBoard: {
        proposalSpeed: rag(tatCompliancePct, 95, 80),
        proposalQuality: rag(
          proposalsApproved.length > 0 ? 100 : null,
          100,
          50,
        ),
        demoQuality: rag(avgDemoScore, 4.8, 4.0),
        assetGrowth: rag(newTemplates + newDemos + newKnowledge, 5, 2),
        aiAdoption: rag(aiAdoptionPct, 90, 60),
        winRate: rag(weekWinRate, 50, 30),
      },
    };
  });

  return okSerialized(data);
});
