import { db } from "@/lib/db";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { PRACTICES, practiceOf } from "@/lib/practices";

/**
 * Reports module aggregation.
 *
 * Shared by the GET (screen), Excel export, and PDF export routes so all three
 * render from one query, never three slightly-different ones. Every figure
 * here is computed from real rows — there is deliberately no "POC success" or
 * "resource utilization" report: PsPoc has no reads/writes anywhere yet, and
 * no per-person capacity/allocation model exists to report on. Adding either
 * report before that data exists would mean fabricating numbers.
 */

export interface MoneyBucket {
  currency: string;
  minorUnits: string;
}

export interface ReportsData {
  months: number;
  generatedAt: string;

  pipeline: { stage: string; label: string; count: number; money: MoneyBucket[] }[];

  industrySplit: { industry: string; count: number; money: MoneyBucket[] }[];

  practiceSplit: {
    derived: true;
    rows: { practice: string; count: number; money: MoneyBucket[] }[];
  };

  winRate: {
    overall: { won: number; lost: number; winRatePct: number | null };
    byReason: Record<string, number>;
    trend: { month: string; label: string; won: number; lost: number; winRatePct: number | null }[];
  };

  revenue: {
    trend: { month: string; label: string; money: MoneyBucket[] }[];
  };

  forecast: {
    trend: { month: string; label: string; money: MoneyBucket[] }[];
  };

  proposalTurnaround: {
    overall: { avgHours: number | null; within24hPct: number | null; approvedCount: number };
    trend: { month: string; label: string; avgHours: number | null; within24hPct: number | null; approvedCount: number }[];
  };

  demoPerformance: { technology: string; count: number; avgScore: number | null }[];
}

function addMoney(buckets: MoneyBucket[], currency: string, minor: bigint) {
  if (minor === 0n) return;
  const existing = buckets.find((b) => b.currency === currency);
  if (existing) existing.minorUnits = (BigInt(existing.minorUnits) + minor).toString();
  else buckets.push({ currency, minorUnits: minor.toString() });
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** `n` month keys ending at the current month (inclusive), oldest first. */
function trailingMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1) + i, 1))),
  );
}

/** `n` month keys starting at the current month (inclusive), oldest first — for forward-looking forecast. */
function forwardMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))),
  );
}

export async function computeReportsData(orgId: string, months: number): Promise<ReportsData> {
  const backMonths = trailingMonths(months);
  const aheadMonths = forwardMonths(months);
  const rangeStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1));
  const rangeEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + months, 1));

  const openEngagements = { orgId, deletedAt: null, closedStatus: "open" as const };

  const [
    byStage,
    byIndustry,
    practiceRows,
    winLossOverall,
    reasonRows,
    winLossTrendRows,
    proposalRows,
    demoByTech,
    forecastRows,
  ] = await Promise.all([
    db.psEngagement.groupBy({
      by: ["stage", "currency"],
      where: openEngagements,
      _count: true,
      _sum: { estRevenue: true },
    }),
    db.psEngagement.groupBy({
      by: ["industry", "currency"],
      where: openEngagements,
      _count: true,
      _sum: { estRevenue: true },
    }),
    db.psEngagement.findMany({
      where: openEngagements,
      select: { techStack: true, estRevenue: true, currency: true },
    }),
    // Whole-org, all-time — win rate is a rate, not a rolling-window figure.
    db.psWinLoss.groupBy({ by: ["outcome"], where: { orgId }, _count: true }),
    db.psWinLoss.groupBy({
      by: ["reasonCategory"],
      where: { orgId, NOT: { reasonCategory: null } },
      _count: true,
    }),
    db.psWinLoss.findMany({
      where: { orgId, createdAt: { gte: rangeStart } },
      select: {
        outcome: true,
        createdAt: true,
        dealSize: true,
        engagement: { select: { estRevenue: true, currency: true } },
      },
    }),
    db.psProposal.findMany({
      where: { orgId, createdAt: { gte: rangeStart } },
      select: { createdAt: true, approvedAt: true },
    }),
    db.psDemo.groupBy({
      by: ["technology"],
      where: { orgId, deletedAt: null, NOT: { feedbackScore: null } },
      _count: true,
      _avg: { feedbackScore: true },
    }),
    db.psEngagement.findMany({
      where: { ...openEngagements, expectedClose: { gte: new Date(), lt: rangeEnd } },
      select: { estRevenue: true, currency: true, probability: true, expectedClose: true },
    }),
  ]);

  // ---- Pipeline by stage ----
  const stageBuckets = new Map<string, { count: number; money: MoneyBucket[] }>();
  for (const row of byStage) {
    const entry = stageBuckets.get(row.stage) ?? { count: 0, money: [] };
    entry.count += row._count;
    if (row._sum.estRevenue) addMoney(entry.money, row.currency ?? "INR", row._sum.estRevenue);
    stageBuckets.set(row.stage, entry);
  }
  const pipeline = ACTIVE_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage as Stage],
    count: stageBuckets.get(stage)?.count ?? 0,
    money: stageBuckets.get(stage)?.money ?? [],
  }));

  // ---- Industry split ----
  const industryBuckets = new Map<string, { count: number; money: MoneyBucket[] }>();
  for (const row of byIndustry) {
    const key = row.industry ?? "Unspecified";
    const entry = industryBuckets.get(key) ?? { count: 0, money: [] };
    entry.count += row._count;
    if (row._sum.estRevenue) addMoney(entry.money, row.currency ?? "INR", row._sum.estRevenue);
    industryBuckets.set(key, entry);
  }
  const industrySplit = [...industryBuckets.entries()]
    .map(([industry, v]) => ({ industry, count: v.count, money: v.money }))
    .sort((a, b) => b.count - a.count);

  // ---- Practice split (derived from tech stack — see lib/practices.ts) ----
  const practiceBuckets = new Map<string, { count: number; money: MoneyBucket[] }>();
  for (const row of practiceRows) {
    const practice = practiceOf(row.techStack);
    const entry = practiceBuckets.get(practice) ?? { count: 0, money: [] };
    entry.count += 1;
    if (row.estRevenue) addMoney(entry.money, row.currency ?? "INR", row.estRevenue);
    practiceBuckets.set(practice, entry);
  }
  const practiceSplit = {
    derived: true as const,
    rows: PRACTICES.filter((p) => practiceBuckets.has(p)).map((practice) => ({
      practice,
      count: practiceBuckets.get(practice)!.count,
      money: practiceBuckets.get(practice)!.money,
    })),
  };

  // ---- Win rate ----
  const won = winLossOverall.find((r) => r.outcome === "won")?._count ?? 0;
  const lost = winLossOverall.find((r) => r.outcome === "lost")?._count ?? 0;
  const winRatePct = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
  const byReason = Object.fromEntries(reasonRows.map((r) => [r.reasonCategory ?? "Unspecified", r._count]));

  const winRateByMonth = new Map<string, { won: number; lost: number }>();
  for (const key of backMonths) winRateByMonth.set(key, { won: 0, lost: 0 });
  for (const row of winLossTrendRows) {
    const key = monthKey(row.createdAt);
    const entry = winRateByMonth.get(key);
    if (!entry) continue;
    if (row.outcome === "won") entry.won += 1;
    else if (row.outcome === "lost") entry.lost += 1;
  }
  const winRateTrend = backMonths.map((key) => {
    const { won: w, lost: l } = winRateByMonth.get(key)!;
    return {
      month: key,
      label: monthLabel(key),
      won: w,
      lost: l,
      winRatePct: w + l > 0 ? Math.round((w / (w + l)) * 100) : null,
    };
  });

  // ---- Revenue (realized, won deals only) ----
  const revenueByMonth = new Map<string, MoneyBucket[]>();
  for (const key of backMonths) revenueByMonth.set(key, []);
  for (const row of winLossTrendRows) {
    if (row.outcome !== "won") continue;
    const key = monthKey(row.createdAt);
    const bucket = revenueByMonth.get(key);
    if (!bucket) continue;
    const amount = row.dealSize ?? row.engagement.estRevenue;
    if (amount) addMoney(bucket, row.engagement.currency ?? "INR", amount);
  }
  const revenueTrend = backMonths.map((key) => ({
    month: key,
    label: monthLabel(key),
    money: revenueByMonth.get(key)!,
  }));

  // ---- Forecast (probability-weighted open pipeline, by expected close month) ----
  const forecastByMonth = new Map<string, MoneyBucket[]>();
  for (const key of aheadMonths) forecastByMonth.set(key, []);
  for (const row of forecastRows) {
    if (!row.estRevenue || !row.expectedClose) continue;
    const key = monthKey(row.expectedClose);
    const bucket = forecastByMonth.get(key);
    if (!bucket) continue;
    // Integer probability (0-100) against minor-unit money — bigint math only,
    // so a forecast never drifts a paisa from floating-point rounding.
    const weighted = (row.estRevenue * BigInt(row.probability)) / 100n;
    addMoney(bucket, row.currency ?? "INR", weighted);
  }
  const forecastTrend = aheadMonths.map((key) => ({
    month: key,
    label: monthLabel(key),
    money: forecastByMonth.get(key)!,
  }));

  // ---- Proposal turnaround (created -> approved) ----
  const approved = proposalRows.filter((p) => p.approvedAt);
  const tatHoursOf = (p: (typeof approved)[number]) => (p.approvedAt!.getTime() - p.createdAt.getTime()) / 3_600_000;
  const overallHours = approved.map(tatHoursOf);
  const overallAvg = overallHours.length
    ? Number((overallHours.reduce((a, b) => a + b, 0) / overallHours.length).toFixed(1))
    : null;
  const overallWithin24h = overallHours.length
    ? Math.round((overallHours.filter((h) => h <= 24).length / overallHours.length) * 100)
    : null;

  const turnaroundByMonth = new Map<string, number[]>();
  for (const key of backMonths) turnaroundByMonth.set(key, []);
  for (const p of approved) {
    const key = monthKey(p.approvedAt!);
    const bucket = turnaroundByMonth.get(key);
    if (bucket) bucket.push(tatHoursOf(p));
  }
  const turnaroundTrend = backMonths.map((key) => {
    const hours = turnaroundByMonth.get(key)!;
    return {
      month: key,
      label: monthLabel(key),
      avgHours: hours.length ? Number((hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1)) : null,
      within24hPct: hours.length ? Math.round((hours.filter((h) => h <= 24).length / hours.length) * 100) : null,
      approvedCount: hours.length,
    };
  });

  // ---- Demo performance ----
  const demoPerformance = demoByTech
    .map((d) => ({
      technology: d.technology,
      count: d._count,
      avgScore: d._avg.feedbackScore ? Number(d._avg.feedbackScore.toFixed(2)) : null,
    }))
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

  return {
    months,
    generatedAt: new Date().toISOString(),
    pipeline,
    industrySplit,
    practiceSplit,
    winRate: {
      overall: { won, lost, winRatePct },
      byReason,
      trend: winRateTrend,
    },
    revenue: { trend: revenueTrend },
    forecast: { trend: forecastTrend },
    proposalTurnaround: {
      overall: { avgHours: overallAvg, within24hPct: overallWithin24h, approvedCount: approved.length },
      trend: turnaroundTrend,
    },
    demoPerformance,
  };
}
