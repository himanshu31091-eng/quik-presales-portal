#!/usr/bin/env node
/**
 * Seed realistic Team KPIs across all teams of the Moreyeahs tenant.
 * Creates 2-5 KPIs per team with weekly target breakdown + actual
 * weekly values for weeks 1 and 2 of FY2026 Q1.
 *
 * Idempotent-ish: if a KPI with the same name+team+quarter+year already
 * exists, it is skipped. Safe to re-run.
 *
 * Usage:
 *   cd packages/database
 *   npx dotenv-cli -e ../../.env.local -- node seed-team-kpis.js
 */

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const TENANT_ID = "cmniw5uyu000042zwp613fjug"; // Moreyeahs
const CREATED_BY = "cmniw5v0l000142zwvwozcvpq"; // super_admin user
const YEAR = 2026;
const QUARTER = "Q1";
const CURRENT_WEEK = 2; // FY2026 Q1 week 2 (today is Apr 10, 2026)
const WEEKS = 13;

// ── KPI templates per team name ────────────────────────────────────────────
// division: "Cumulative" → target splits across 13 weeks (counts, revenue)
//           "Standalone" → target applies to every week (rates, averages, uptime)
const TEMPLATES = {
  "Account Management": [
    { name: "Client Retention Rate",        description: "% of clients retained QoQ",                        unit: "Percentage", target: 92,      reverse: false, division: "Standalone" },
    { name: "Quarterly Renewal Revenue",    description: "Total renewal revenue signed this quarter",        unit: "Currency",   target: 500000,  reverse: false, division: "Cumulative", currency: "USD" },
    { name: "Avg Account Health Score",     description: "Average health score across managed accounts",     unit: "Number",     target: 85,      reverse: false, division: "Standalone" },
    { name: "Support Tickets Resolved",     description: "Closed customer support tickets",                  unit: "Number",     target: 260,     reverse: false, division: "Cumulative" },
    { name: "Client Satisfaction (CSAT)",   description: "CSAT survey score",                                unit: "Percentage", target: 90,      reverse: false, division: "Standalone" },
  ],
  "Engineering": [
    { name: "Weekly Deployments",           description: "Production deploys shipped each week",             unit: "Number",     target: 52,      reverse: false, division: "Cumulative" },
    { name: "Mean Time to Resolution (hrs)",description: "Average incident resolution time",                 unit: "Number",     target: 4,       reverse: true,  division: "Standalone" },
    { name: "Code Review Turnaround (hrs)", description: "Average PR review turnaround",                     unit: "Number",     target: 8,       reverse: true,  division: "Standalone" },
    { name: "Sprint Velocity",              description: "Story points completed per sprint",                unit: "Number",     target: 130,     reverse: false, division: "Standalone" },
    { name: "Production Incidents",         description: "P0/P1 incidents in production",                    unit: "Number",     target: 26,      reverse: true,  division: "Cumulative" },
  ],
  "Human Resource": [
    { name: "Time to Hire (days)",          description: "Avg days from requisition to offer accept",        unit: "Number",     target: 30,      reverse: true,  division: "Standalone" },
    { name: "Employee Engagement Score",    description: "Quarterly pulse survey engagement",                unit: "Percentage", target: 85,      reverse: false, division: "Standalone" },
    { name: "Training Hours Completed",     description: "Total training hrs completed org-wide",            unit: "Number",     target: 650,     reverse: false, division: "Cumulative" },
    { name: "Voluntary Attrition Rate",     description: "Voluntary leavers this quarter",                   unit: "Percentage", target: 6,       reverse: true,  division: "Standalone" },
  ],
  "IT Infrastructure": [
    { name: "System Uptime",                description: "Core services uptime",                             unit: "Percentage", target: 99.9,    reverse: false, division: "Standalone" },
    { name: "Mean Time to Recovery (min)",  description: "Avg recovery time after incidents",                unit: "Number",     target: 15,      reverse: true,  division: "Standalone" },
    { name: "Security Patches Applied",     description: "Critical/high patches applied on schedule",        unit: "Number",     target: 130,     reverse: false, division: "Cumulative" },
    { name: "Helpdesk Closure Rate",        description: "Tickets closed within SLA",                        unit: "Percentage", target: 95,      reverse: false, division: "Standalone" },
  ],
  "Leadership": [
    { name: "Company NPS",                  description: "Net Promoter Score across all customers",          unit: "Number",     target: 50,      reverse: false, division: "Standalone" },
    { name: "OKR Completion Rate",          description: "% of company OKRs on track or met",                unit: "Percentage", target: 80,      reverse: false, division: "Standalone" },
    { name: "Strategic Initiatives Delivered", description: "Quarterly strategic projects delivered",        unit: "Number",     target: 13,      reverse: false, division: "Cumulative" },
    { name: "Board Meeting Attendance",     description: "Board attendance rate",                            unit: "Percentage", target: 100,     reverse: false, division: "Standalone" },
  ],
  "Marketing": [
    { name: "MQL Generated",                description: "Marketing qualified leads generated",              unit: "Number",     target: 520,     reverse: false, division: "Cumulative" },
    { name: "Website Traffic",              description: "Unique visitors to the marketing site",            unit: "Number",     target: 65000,   reverse: false, division: "Cumulative" },
    { name: "Email Open Rate",              description: "Average open rate across campaigns",               unit: "Percentage", target: 28,      reverse: false, division: "Standalone" },
    { name: "Cost Per Lead",                description: "Ad spend divided by MQLs",                         unit: "Currency",   target: 45,      reverse: true,  division: "Standalone", currency: "USD" },
    { name: "Content Pieces Published",     description: "Blog posts + whitepapers + case studies",          unit: "Number",     target: 39,      reverse: false, division: "Cumulative" },
  ],
  "Operations": [
    { name: "Operational Efficiency Ratio", description: "Output vs input ratio",                            unit: "Ratio",      target: 1.25,    reverse: false, division: "Standalone" },
    { name: "Process Cycle Time (hrs)",     description: "End-to-end process cycle time",                    unit: "Number",     target: 18,      reverse: true,  division: "Standalone" },
    { name: "Vendor On-Time Delivery",      description: "Supplier on-time delivery rate",                   unit: "Percentage", target: 95,      reverse: false, division: "Standalone" },
    { name: "Inventory Turnover",           description: "Inventory turnover ratio",                         unit: "Ratio",      target: 6,       reverse: false, division: "Standalone" },
  ],
  "Partnership": [
    { name: "New Partnerships Signed",      description: "Net-new partner agreements signed",                unit: "Number",     target: 13,      reverse: false, division: "Cumulative" },
    { name: "Partner Sourced Revenue",      description: "Revenue attributable to partner channel",          unit: "Currency",   target: 250000,  reverse: false, division: "Cumulative", currency: "USD" },
    { name: "Partner Satisfaction Score",   description: "Partner quarterly survey score",                   unit: "Percentage", target: 88,      reverse: false, division: "Standalone" },
    { name: "Joint Campaigns Executed",     description: "Co-marketing campaigns launched",                  unit: "Number",     target: 13,      reverse: false, division: "Cumulative" },
  ],
  "Quality Assurance": [
    { name: "Test Coverage",                description: "Automated test coverage %",                        unit: "Percentage", target: 85,      reverse: false, division: "Standalone" },
    { name: "Defect Escape Rate",           description: "Bugs reaching production",                         unit: "Percentage", target: 3,       reverse: true,  division: "Standalone" },
    { name: "Automated Test Pass Rate",     description: "CI suite pass rate",                               unit: "Percentage", target: 98,      reverse: false, division: "Standalone" },
    { name: "Bugs Found in Pre-prod",       description: "Bugs caught before release",                       unit: "Number",     target: 130,     reverse: false, division: "Cumulative" },
    { name: "Regression Suite Runtime (min)", description: "Full regression suite runtime",                  unit: "Number",     target: 25,      reverse: true,  division: "Standalone" },
  ],
  "Service Sales Team": [
    { name: "New Service Revenue",          description: "New service bookings closed",                      unit: "Currency",   target: 750000,  reverse: false, division: "Cumulative", currency: "USD" },
    { name: "Deal Close Rate",              description: "% of qualified opportunities closed won",          unit: "Percentage", target: 32,      reverse: false, division: "Standalone" },
    { name: "Sales Cycle Length (days)",    description: "Avg days from first contact to close",             unit: "Number",     target: 45,      reverse: true,  division: "Standalone" },
    { name: "Upsell Rate",                  description: "% of accounts upsold this quarter",                unit: "Percentage", target: 18,      reverse: false, division: "Standalone" },
    { name: "Pipeline Generated",           description: "Total pipeline value created",                     unit: "Currency",   target: 2500000, reverse: false, division: "Cumulative", currency: "USD" },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pickN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }

// For Cumulative: spreads target across 13 weeks.
// For Standalone: target is applied to EVERY week.
function buildWeeklyTargets(target, unit, division) {
  const map = {};
  if (division === "Standalone") {
    const val = unit === "Number" ? Math.round(target) : parseFloat(target.toFixed(2));
    for (let w = 1; w <= WEEKS; w++) map[String(w)] = val;
    return map;
  }
  // Cumulative
  if (unit === "Number") {
    const base = Math.floor(target / WEEKS);
    const extra = Math.round(target - base * WEEKS);
    for (let w = 1; w <= WEEKS; w++) {
      map[String(w)] = (WEEKS - w < extra) ? base + 1 : base;
    }
  } else {
    const base = parseFloat((target / WEEKS).toFixed(2));
    for (let w = 1; w <= WEEKS; w++) map[String(w)] = base;
    const diff = parseFloat((target - base * WEEKS).toFixed(2));
    map[String(WEEKS)] = parseFloat((base + diff).toFixed(2));
  }
  return map;
}

// Build per-week actuals for weeks 1..CURRENT_WEEK.
// Uses per-week variance around the weekly target depending on scenario.
function buildWeeklyActuals(weeklyTargets, reverse, unit, scenario) {
  const out = [];
  for (let w = 1; w <= CURRENT_WEEK; w++) {
    const t = weeklyTargets[String(w)];
    if (t == null) continue;

    // Factor variance by scenario
    //   "ahead"   → forward 1.08-1.20, reverse 0.75-0.92
    //   "ontrack" → forward 0.96-1.08, reverse 0.92-1.05
    //   "behind"  → forward 0.72-0.90, reverse 1.10-1.28
    let factor;
    if (scenario === "ahead")       factor = reverse ? rand(0.75, 0.92) : rand(1.08, 1.20);
    else if (scenario === "behind") factor = reverse ? rand(1.10, 1.28) : rand(0.72, 0.90);
    else                            factor = reverse ? rand(0.92, 1.05) : rand(0.96, 1.08);

    let val = t * factor;

    if (unit === "Number") {
      // Round but preserve direction of variance on small targets
      const raw = val;
      val = Math.round(raw);
      if (val === Math.round(t) && raw !== t) {
        val += raw > t ? 1 : -1;
      }
      if (val < 0) val = 0;
    } else {
      val = parseFloat(val.toFixed(2));
    }
    out.push([w, val]);
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const teams = await db.team.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });

  if (teams.length === 0) {
    console.log("No teams found for tenant. Aborting.");
    return;
  }

  const scenarios = ["ahead", "ontrack", "ontrack", "behind"];
  let createdCount = 0;
  let skippedCount = 0;
  const report = [];

  for (const team of teams) {
    const templates = TEMPLATES[team.name];
    if (!templates) {
      console.log(`⚠ No templates for team "${team.name}" — skipping`);
      continue;
    }

    const howMany = randInt(2, Math.min(5, templates.length));
    const chosen = pickN(templates, howMany);
    const teamReport = { team: team.name, created: [] };

    for (const tpl of chosen) {
      const existing = await db.kPI.findFirst({
        where: {
          tenantId: TENANT_ID,
          teamId: team.id,
          name: tpl.name,
          year: YEAR,
          quarter: QUARTER,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        skippedCount++;
        teamReport.created.push(`⊝ ${tpl.name} (already exists)`);
        continue;
      }

      const weeklyTargets = buildWeeklyTargets(tpl.target, tpl.unit, tpl.division);
      const scenario = scenarios[randInt(0, scenarios.length - 1)];
      const actuals = buildWeeklyActuals(weeklyTargets, tpl.reverse, tpl.unit, scenario);

      const qtdAchieved = actuals.reduce((s, [, v]) => s + v, 0);
      const expectedQtd = Array.from({ length: CURRENT_WEEK }, (_, i) => weeklyTargets[String(i + 1)] ?? 0)
        .reduce((s, v) => s + v, 0);

      let progressPercent = 0;
      if (expectedQtd > 0 && qtdAchieved > 0) {
        progressPercent = tpl.reverse
          ? Math.round((expectedQtd / qtdAchieved) * 100)
          : Math.round((qtdAchieved / expectedQtd) * 100);
      } else if (expectedQtd > 0 && qtdAchieved === 0 && tpl.reverse) {
        progressPercent = 200;
      }

      let healthStatus = "on-track";
      if (progressPercent >= 100) healthStatus = "on-track";
      else if (progressPercent >= 80) healthStatus = "behind-schedule";
      else healthStatus = "critical";

      const kpi = await db.kPI.create({
        data: {
          tenantId: TENANT_ID,
          name: tpl.name,
          description: tpl.description,
          kpiLevel: "team",
          owner: null,
          teamId: team.id,
          parentKPIId: null,
          quarter: QUARTER,
          year: YEAR,
          measurementUnit: tpl.unit,
          target: tpl.target,
          quarterlyGoal: tpl.target,
          qtdGoal: tpl.target,
          qtdAchieved: parseFloat(qtdAchieved.toFixed(2)),
          progressPercent,
          status: "active",
          healthStatus,
          divisionType: tpl.division,
          weeklyTargets,
          currency: tpl.currency ?? null,
          targetScale: null,
          reverseColor: tpl.reverse,
          createdBy: CREATED_BY,
        },
        select: { id: true, name: true },
      });

      for (const [w, v] of actuals) {
        await db.kPIWeeklyValue.create({
          data: {
            tenantId: TENANT_ID,
            kpiId: kpi.id,
            weekNumber: w,
            value: v,
            notes: null,
            createdBy: CREATED_BY,
          },
        });
      }

      await db.kPILog.create({
        data: {
          tenantId: TENANT_ID,
          kpiId: kpi.id,
          action: "CREATE",
          newValue: JSON.stringify({ seeded: true, scenario, progressPercent, division: tpl.division }),
          changedBy: CREATED_BY,
        },
      });

      createdCount++;
      teamReport.created.push(`✓ ${tpl.name} (${tpl.unit} ${tpl.division}, target=${tpl.target}, ${scenario}, ${progressPercent}%)`);
    }

    report.push(teamReport);
  }

  console.log("\n═══ Team KPI Seed Report ═══\n");
  for (const r of report) {
    console.log(`■ ${r.team}`);
    for (const line of r.created) console.log(`    ${line}`);
  }
  console.log(`\n✓ Created ${createdCount} team KPIs across ${report.length} teams`);
  if (skippedCount > 0) console.log(`⊝ Skipped ${skippedCount} (already existed)`);
  console.log();

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
