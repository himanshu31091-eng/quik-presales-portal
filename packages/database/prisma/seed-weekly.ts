/**
 * Weekly Data Seed
 * Run: node_modules/.bin/tsx prisma/seed-weekly.ts
 *
 * Fills:
 *  - KPIWeeklyValue   — 13 weeks per Q1 KPI, 6 weeks per Q2 KPI (skips complete ones)
 *  - PriorityWeeklyStatus — 13 weeks per priority, pattern based on overallStatus
 *  - WWWItem          — 14 realistic action items across the team
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TENANT = "cmniw5uyu000042zwp613fjug";

// All 9 user IDs in the tenant
const U = {
  ashwin:   "cmniw5v0l000142zwvwozcvpq",
  dhwani:   "cmniw5v0o000242zwnjercy0p",
  akhilesh: "cmniw5v0o000342zwtz2kqr1l",
  sarim:    "cmnobj61i000011ps624xyfk2",
  marcus:   "cmnololmz0000s36f9izogdif",
  lisa:     "cmnololn50003s36f7bzn0sjf",
  priya:    "cmnololn40002s36fmdrrahry",
  tom:      "cmnololn40001s36fc6eu33ep",
  sarah:    "cmnololn50004s36f09jww9cm",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seeded pseudo-random so reruns produce same values */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/**
 * Distribute `total` across `n` weeks with realistic variance.
 * High performers get consistent delivery; low performers are lumpy.
 */
function distributeAcrossWeeks(
  total: number,
  n: number,
  progressPct: number,
  kpiId: string
): number[] {
  if (!total || total <= 0 || n <= 0) return Array(n).fill(0);

  const base = total / n;
  // Variance amplitude: high performers have tighter distribution
  const varianceFactor = progressPct >= 80 ? 0.25 : progressPct >= 50 ? 0.45 : 0.65;

  const values: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const r = seededRand(kpiId.charCodeAt(i % kpiId.length) * (i + 7));
    const variance = (r - 0.5) * base * varianceFactor;
    values.push(Math.max(0, parseFloat((base + variance).toFixed(4))));
  }
  // Last week = remainder to make sum exact
  const soFar = values.reduce((a, b) => a + b, 0);
  values.push(Math.max(0, parseFloat((total - soFar).toFixed(4))));
  return values;
}

/**
 * Return the priority weekly status string for a given week,
 * based on the final overallStatus and number of total weeks.
 */
function priorityWeekStatus(
  week: number,
  totalWeeks: number,
  overallStatus: string
): string {
  switch (overallStatus) {
    case "completed":
      // First 77% on-track → last 23% completed
      return week <= Math.floor(totalWeeks * 0.77) ? "on-track" : "completed";

    case "on-track":
      // Steady on-track all the way
      return "on-track";

    case "behind":
      // First ~38% on-track → then behind-schedule
      return week <= Math.floor(totalWeeks * 0.38) ? "on-track" : "behind-schedule";

    case "not-started":
    default:
      return "not-yet-started";
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding weekly data…\n");

  // ── 1. KPI Weekly Values ───────────────────────────────────────────────────
  console.log("📊 Filling KPI weekly values…");

  // Fetch KPIs + which weeks are already filled
  const kpis = await db.kPI.findMany({
    where: { tenantId: TENANT },
    select: {
      id: true, name: true, quarter: true, year: true,
      quarterlyGoal: true, qtdAchieved: true, progressPercent: true,
      createdBy: true,
      weeklyValues: { select: { weekNumber: true, value: true } },
    },
  });

  let kpiValCount = 0;

  for (const kpi of kpis) {
    const totalWeeks = 13; // all quarters = 13 weeks
    const q2Active   = kpi.quarter === "Q2"; // Q2 is in progress — fill only 6 weeks
    const activeWeeks = q2Active ? 6 : totalWeeks;

    const existingWeeks = new Set(kpi.weeklyValues.map(v => v.weekNumber));

    // Skip KPIs that already have all active weeks filled
    if (existingWeeks.size >= activeWeeks) continue;

    // Figure out which weeks need filling
    const missingWeeks: number[] = [];
    for (let w = 1; w <= activeWeeks; w++) {
      if (!existingWeeks.has(w)) missingWeeks.push(w);
    }
    if (missingWeeks.length === 0) continue;

    // Calculate remaining amount to distribute
    const existingSum = kpi.weeklyValues.reduce((s, v) => s + (v.value ?? 0), 0);
    const remaining   = Math.max(0, (kpi.qtdAchieved ?? 0) - existingSum);
    const prog        = Math.round(kpi.progressPercent ?? 0);

    const weekValues = distributeAcrossWeeks(
      remaining,
      missingWeeks.length,
      prog,
      kpi.id
    );

    for (let i = 0; i < missingWeeks.length; i++) {
      await db.kPIWeeklyValue.upsert({
        where: { kpiId_weekNumber: { kpiId: kpi.id, weekNumber: missingWeeks[i] } },
        update: {},
        create: {
          tenantId: TENANT,
          kpiId: kpi.id,
          weekNumber: missingWeeks[i],
          value: weekValues[i],
          createdBy: kpi.createdBy,
          updatedBy: kpi.createdBy,
        },
      });
      kpiValCount++;
    }
  }
  console.log(`  ✅ Inserted ${kpiValCount} KPI weekly value records`);

  // ── 2. Priority Weekly Statuses ────────────────────────────────────────────
  console.log("\n🎯 Filling priority weekly statuses…");

  const priorities = await db.priority.findMany({
    where: { tenantId: TENANT },
    select: {
      id: true, overallStatus: true, quarter: true,
      weeklyStatuses: { select: { weekNumber: true } },
    },
  });

  let priStatCount = 0;

  for (const pri of priorities) {
    const totalWeeks = 13;
    const existingWeeks = new Set(pri.weeklyStatuses.map(s => s.weekNumber));

    for (let w = 1; w <= totalWeeks; w++) {
      if (existingWeeks.has(w)) continue;

      const status = priorityWeekStatus(w, totalWeeks, pri.overallStatus);

      await db.priorityWeeklyStatus.upsert({
        where: { priorityId_weekNumber: { priorityId: pri.id, weekNumber: w } },
        update: {},
        create: { priorityId: pri.id, weekNumber: w, status },
      });
      priStatCount++;
    }
  }
  console.log(`  ✅ Inserted ${priStatCount} priority weekly status records`);

  // ── 3. WWW Items ────────────────────────────────────────────────────────────
  console.log("\n📋 Adding WWW items…");

  const now = new Date();
  const d = (daysOffset: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + daysOffset);
    return dt;
  };

  const wwwItems = [
    // ── Overdue / completed
    { who: U.ashwin,   what: "Submit board Q1 performance report",             when: d(-14), status: "completed"      },
    { who: U.dhwani,   what: "Deploy authentication refactor to staging",       when: d(-7),  status: "completed"      },
    { who: U.sarim,    what: "Send revised proposal to Nexus Corp",             when: d(-10), status: "completed"      },
    { who: U.akhilesh, what: "Complete unit tests for KPI dashboard v2",        when: d(-3),  status: "completed"      },
    { who: U.sarah,    what: "Renew SLA agreements with top 3 accounts",        when: d(-5),  status: "completed"      },

    // ── In progress
    { who: U.ashwin,   what: "Review and approve Q2 headcount plan",           when: d(3),   status: "in-progress"    },
    { who: U.dhwani,   what: "Finalise API documentation for release notes",   when: d(5),   status: "in-progress"    },
    { who: U.priya,    what: "Schedule interviews for 5 open engineering roles",when: d(4),  status: "in-progress"    },
    { who: U.tom,      what: "Launch Q2 digital campaign on LinkedIn & Meta",   when: d(2),  status: "in-progress"    },
    { who: U.sarim,    what: "Update CRM pipeline for all deals > $50K",        when: d(6),  status: "in-progress"    },

    // ── Not started / upcoming
    { who: U.marcus,   what: "Automate regression suite for checkout flow",     when: d(10),  status: "not-started"    },
    { who: U.lisa,     what: "Document SLA breach escalation process",          when: d(14),  status: "not-started"    },
    { who: U.akhilesh, what: "Migrate legacy auth module to NextAuth v5",       when: d(12),  status: "not-started"    },
    { who: U.priya,    what: "Distribute employee engagement survey (Q2)",      when: d(18),  status: "not-started"    },

    // ── Behind / at risk
    { who: U.tom,      what: "Deliver brand refresh deck to design agency",     when: d(-2),  status: "behind-schedule"},
    { who: U.lisa,     what: "Submit Q1 operations variance report",            when: d(-1),  status: "behind-schedule"},
  ];

  let wwwCount = 0;
  for (const item of wwwItems) {
    await db.wWWItem.create({
      data: {
        tenantId: TENANT,
        who: item.who,
        what: item.what,
        when: item.when,
        status: item.status,
        createdBy: U.ashwin,
      },
    });
    wwwCount++;
  }
  console.log(`  ✅ Created ${wwwCount} WWW items`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
🎉 Weekly seed complete!
   KPI weekly values:        +${kpiValCount}
   Priority weekly statuses: +${priStatCount}
   WWW items:                +${wwwCount}
`);
}

main()
  .catch(e => { console.error("❌", e); process.exit(1); })
  .finally(() => db.$disconnect());
