/**
 * seed-moreyeahs-demo.ts — dummy data for the "Moreyeahs" tenant
 * (id: cmopuezv400016i6tqpfckfsv) covering all major QuikScale modules.
 *
 * Seeds:
 *   - 3 new users (Dhwani:manager, Himanshu:employee, Rohit:employee)
 *     + memberships + per-app access for all 4 apps
 *   - Org Setup: 2 teams, 4 quarter settings (Q1-Q4 FY2026), 4 categories,
 *     accountability functions
 *   - KPI Individual: 1-5 per member (random)
 *   - KPI Team: 3 team KPIs (multi-owner)
 *   - Priority: 1-2 per member
 *   - WWW: 3-5 per member (random)
 *   - OPSP: 1 filled OPSP for FY2026 Q1
 *   - Meeting Rhythm: 1 Client + 4 ClientMembers + 3 daily huddles + 2 weekly meetings
 *
 * Idempotent: wipes tenant-scoped demo data + the 3 new users, then re-seeds.
 * Does NOT touch other tenants or the existing super-admin user.
 *
 * Run:
 *   cd packages/database
 *   DATABASE_URL='postgresql://...' npx tsx prisma/seed-moreyeahs-demo.ts --confirm
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = "cmopuezv400016i6tqpfckfsv"; // Moreyeahs (created 2026-05-03)
const ASHWIN_ID = "cmoqrc5n8000710bd69gs4fgb"; // existing super-admin (unchanged)

// Real existing CUIDs (these users were already created via admin UI before this seed ran).
// We upsert to keep their IDs intact and avoid losing FKs from anything that references them.
const NEW_USERS = [
  { id: "cmoqrcn2s0001cgsvnxooo555", email: "dhwani@moreyeahs.com", firstName: "Dhwani", lastName: "Patel", role: "manager" },
  { id: "cmoqrd2zd0002pbzg04fi1d2v", email: "himanshu@moreyeahs.com", firstName: "Himanshu", lastName: "Singh", role: "employee" },
  { id: "cmoqrdk6q000acgsvr8ya6a16", email: "rohit@moreyeahs.com", firstName: "Rohit", lastName: "Kumar", role: "employee" },
];

const ALL_MEMBERS = [
  { id: ASHWIN_ID, name: "Ashwin", role: "admin" },
  ...NEW_USERS.map(u => ({ id: u.id, name: u.firstName, role: u.role })),
];

const TEAMS = [
  { id: "tmoqrcdemo0010engineer", name: "Engineering", slug: "engineering" },
  { id: "tmoqrcdemo0020sales000", name: "Sales", slug: "sales" },
];

// FY2026 quarters (April-start, India fiscal). Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
const QUARTERS = [
  { quarter: "Q1", year: 2026, startDate: new Date("2026-04-01"), endDate: new Date("2026-06-30") },
  { quarter: "Q2", year: 2026, startDate: new Date("2026-07-01"), endDate: new Date("2026-09-30") },
  { quarter: "Q3", year: 2026, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31") },
  { quarter: "Q4", year: 2026, startDate: new Date("2027-01-01"), endDate: new Date("2027-03-31") },
];

const CATEGORIES = [
  { name: "Revenue", dataType: "Currency", currency: "INR" },
  { name: "Operations", dataType: "Number", currency: null },
  { name: "People", dataType: "Number", currency: null },
  { name: "Customer Satisfaction", dataType: "Percentage", currency: null },
];

// KPI templates for individuals (random 1-5 per member, picked from this pool)
const INDIVIDUAL_KPI_POOL = [
  { name: "Monthly Revenue", unit: "INR", target: 1500000, scale: "L" },
  { name: "Tickets Resolved", unit: "Number", target: 50, scale: null },
  { name: "Customer NPS", unit: "Percentage", target: 80, scale: null },
  { name: "PR Reviews Completed", unit: "Number", target: 40, scale: null },
  { name: "Sales Calls Made", unit: "Number", target: 60, scale: null },
  { name: "Hires Closed", unit: "Number", target: 4, scale: null },
  { name: "Demo Conversions", unit: "Percentage", target: 35, scale: null },
  { name: "Bug Fixes Shipped", unit: "Number", target: 25, scale: null },
  { name: "Onboarding Calls", unit: "Number", target: 15, scale: null },
  { name: "Marketing Qualified Leads", unit: "Number", target: 200, scale: null },
];

const TEAM_KPI_POOL = [
  { name: "Quarterly Revenue", unit: "INR", target: 12000000, scale: "L" },
  { name: "Team Velocity (Story Points)", unit: "Number", target: 600, scale: null },
  { name: "Customer Retention Rate", unit: "Percentage", target: 95, scale: null },
];

const PRIORITY_TEMPLATES = [
  "Launch v2 of customer portal",
  "Migrate legacy CRM to new stack",
  "Hire 2 senior engineers",
  "Run Q1 OKR planning workshop",
  "Close 5 enterprise deals",
  "Set up CI/CD for mobile apps",
  "Reduce p95 API latency by 30%",
  "Roll out new pricing model",
];

const PRIORITY_STATUSES = ["not-started", "on-track", "behind-schedule", "completed"];

const WWW_TEMPLATES = [
  "Closed first enterprise deal",
  "Shipped dark mode support",
  "Hosted successful tech meetup",
  "Reduced bug backlog by 40%",
  "Onboarded new team member",
  "Got 5-star customer review",
  "Migrated DB to new cluster",
  "Hit weekly KPI target",
  "Wrote internal RFC adopted by team",
  "Resolved long-standing tech debt",
  "Mentored junior engineer",
  "Improved deployment time by 50%",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function getCurrentWeek(quarterStart: Date): number {
  const now = new Date();
  const diff = now.getTime() - quarterStart.getTime();
  return Math.max(1, Math.min(13, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1));
}

// ── Wipe ──────────────────────────────────────────────────────────────────────

async function wipeDemoData(): Promise<void> {
  console.log("🧨 Wiping existing demo data for Moreyeahs tenant…");

  // Delete tenant-scoped data (CASCADE handles intra-relations)
  await prisma.$transaction([
    prisma.kPIWeeklyValue.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.kPI.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.priorityWeeklyStatus.deleteMany({ where: { priority: { tenantId: TENANT_ID } } }),
    prisma.priority.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.wWWItem.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.oPSPData.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.oPSPPlan.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.clientWeeklyMeeting.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.clientDailyHuddle.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.clientMember.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.client.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.accountabilityFunction.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.categoryMaster.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.quarterSetting.deleteMany({ where: { tenantId: TENANT_ID } }),
    prisma.team.deleteMany({ where: { tenantId: TENANT_ID } }),
  ]);

  // Wipe memberships + UserAppAccess for the 3 demo users (but keep User rows — they exist via admin UI)
  const newUserIds = NEW_USERS.map(u => u.id);
  await prisma.$transaction([
    prisma.userAppAccess.deleteMany({ where: { userId: { in: newUserIds } } }),
    prisma.orgMember.deleteMany({ where: { userId: { in: newUserIds } } }),
  ]);

  console.log("  ✓ wiped\n");
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seedTenantSettings() {
  console.log("⚙️  Setting tenant fiscalYearStart=4 (April)…");
  await prisma.org.update({
    where: { id: TENANT_ID },
    data: { fiscalYearStart: 4, quarterStartMonth: 4 },
  });
  console.log("  ✓ done\n");
}

async function seedNewUsers() {
  console.log("👥 Creating 3 new users…");
  const hashed = await bcrypt.hash("password123", 12);
  for (const u of NEW_USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        password: hashed,
        firstName: u.firstName,
        lastName: u.lastName,
      },
      create: {
        id: u.id,
        email: u.email,
        password: hashed,
        firstName: u.firstName,
        lastName: u.lastName,
        emailVerified: new Date(),
        isSuperAdmin: false,
      },
    });
    await prisma.orgMember.create({
      data: {
        tenantId: TENANT_ID,
        userId: u.id,
        role: u.role,
        status: "active",
        acceptedAt: new Date(),
      },
    });
    // Grant access to all 4 apps
    const apps = await prisma.app.findMany();
    for (const app of apps) {
      await prisma.userAppAccess.create({
        data: {
          userId: u.id,
          tenantId: TENANT_ID,
          appId: app.id,
          role: u.role === "manager" ? "admin" : "member",
          grantedBy: ASHWIN_ID,
        },
      });
    }
    console.log(`  ✓ ${u.email} (role=${u.role}, ${apps.length} app access rows)`);
  }
  console.log();
}

async function seedTeams() {
  console.log("🏢 Creating 2 teams…");
  for (const [i, t] of TEAMS.entries()) {
    await prisma.team.create({
      data: {
        id: t.id,
        tenantId: TENANT_ID,
        name: t.name,
        slug: t.slug,
        headId: i === 0 ? ASHWIN_ID : NEW_USERS[0]!.id, // Engineering→Ashwin, Sales→Dhwani
        color: i === 0 ? "#3b82f6" : "#10b981",
        createdBy: ASHWIN_ID,
      },
    });
  }
  console.log(`  ✓ ${TEAMS.length} teams\n`);
}

async function seedQuarters() {
  console.log("📅 Creating 4 quarter settings (FY2026 Q1-Q4)…");
  const now = new Date();
  for (const q of QUARTERS) {
    const status = q.endDate < now ? "completed" : q.startDate > now ? "upcoming" : "active";
    await prisma.quarterSetting.create({
      data: {
        tenantId: TENANT_ID,
        fiscalYear: q.year,
        quarter: q.quarter,
        startDate: q.startDate,
        endDate: q.endDate,
        status,
        createdBy: ASHWIN_ID,
      },
    });
  }
  console.log(`  ✓ ${QUARTERS.length} quarter settings\n`);
}

async function seedCategories() {
  console.log("🏷️  Creating 4 categories…");
  for (const c of CATEGORIES) {
    await prisma.categoryMaster.create({
      data: {
        tenantId: TENANT_ID,
        name: c.name,
        nameKey: c.name.toLowerCase().trim(),
        dataType: c.dataType,
        currency: c.currency,
        createdBy: ASHWIN_ID,
      },
    });
  }
  console.log(`  ✓ ${CATEGORIES.length} categories\n`);
}

async function seedAccountabilityFunctions() {
  console.log("🧭 Creating accountability functions…");
  // Engineering: 1 parent + 2 children. Sales: 1 parent.
  const engId = "afmoqrcdemo001engineer";
  await prisma.accountabilityFunction.create({
    data: {
      id: engId,
      tenantId: TENANT_ID,
      name: "Engineering Excellence",
      description: "Ship reliable software",
      teamId: TEAMS[0]!.id,
      assignedToUserId: ASHWIN_ID,
    },
  });
  await prisma.accountabilityFunction.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        name: "Code Review Ownership",
        teamId: TEAMS[0]!.id,
        parentFunctionId: engId,
        assignedToUserId: NEW_USERS[1]!.id,
      },
      {
        tenantId: TENANT_ID,
        name: "Production Reliability",
        teamId: TEAMS[0]!.id,
        parentFunctionId: engId,
        assignedToUserId: NEW_USERS[2]!.id,
      },
      {
        tenantId: TENANT_ID,
        name: "Sales Pipeline Growth",
        teamId: TEAMS[1]!.id,
        assignedToUserId: NEW_USERS[0]!.id,
      },
    ],
  });
  console.log("  ✓ 4 functions (1 with 2 children + 1 standalone)\n");
}

async function seedIndividualKPIs() {
  console.log("📊 Creating individual KPIs (1-5 per member, random)…");
  const q1 = QUARTERS[0]!;
  const currentWeek = getCurrentWeek(q1.startDate);
  let total = 0,
    weeklyTotal = 0;

  for (const member of ALL_MEMBERS) {
    const count = randInt(1, 5);
    const picks = pickN(INDIVIDUAL_KPI_POOL, count);
    for (const tmpl of picks) {
      const target = tmpl.target;
      const weeklyTargets: Record<string, number> = {};
      for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = target / 13;

      const kpi = await prisma.kPI.create({
        data: {
          tenantId: TENANT_ID,
          name: `${tmpl.name} (${member.name})`,
          description: `Auto-generated demo KPI for ${member.name}`,
          kpiLevel: "individual",
          owner: member.id,
          ownerIds: [],
          quarter: "Q1",
          year: q1.year,
          measurementUnit: tmpl.unit,
          target,
          quarterlyGoal: target,
          qtdGoal: target,
          divisionType: "Cumulative",
          weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
          targetScale: tmpl.scale,
          frequency: "weekly",
          status: "active",
          healthStatus: rand(["on-track", "at-risk", "on-track", "on-track"]),
          reverseColor: false,
          createdBy: member.id,
        },
      });

      // Weekly values: 5-currentWeek weeks of actuals (random ±20% of weekly target)
      const weeksWithActuals = Math.min(currentWeek - 1, randInt(5, 10));
      let qtdAchieved = 0;
      for (let w = 1; w <= weeksWithActuals; w++) {
        const expected = target / 13;
        const actual = expected * (0.6 + Math.random() * 0.6); // 60%-120%
        await prisma.kPIWeeklyValue.create({
          data: {
            tenantId: TENANT_ID,
            kpiId: kpi.id,
            userId: member.id,
            weekNumber: w,
            value: Math.round(actual * 100) / 100,
            createdBy: member.id,
          },
        });
        qtdAchieved += actual;
        weeklyTotal++;
      }
      await prisma.kPI.update({
        where: { id: kpi.id },
        data: { qtdAchieved: Math.round(qtdAchieved * 100) / 100 },
      });
      total++;
    }
    console.log(`  ✓ ${member.name}: ${count} KPIs`);
  }
  console.log(`  ✓ ${total} individual KPIs total (+ ${weeklyTotal} weekly value rows)\n`);
}

async function seedTeamKPIs() {
  console.log("👥 Creating 3 team KPIs (multi-owner)…");
  const q1 = QUARTERS[0]!;
  const currentWeek = getCurrentWeek(q1.startDate);
  let weeklyTotal = 0;

  for (const [i, tmpl] of TEAM_KPI_POOL.entries()) {
    const ownerIds = pickN(ALL_MEMBERS, randInt(2, 4)).map(m => m.id);
    const contribPerOwner = 100 / ownerIds.length;
    const ownerContributions: Record<string, number> = {};
    ownerIds.forEach(id => (ownerContributions[id] = contribPerOwner));

    const target = tmpl.target;
    const weeklyTargets: Record<string, number> = {};
    for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = target / 13;

    const kpi = await prisma.kPI.create({
      data: {
        tenantId: TENANT_ID,
        name: tmpl.name,
        description: `Team-wide ${tmpl.name}`,
        kpiLevel: "team",
        owner: ownerIds[0]!,
        ownerIds,
        ownerContributions: ownerContributions as Prisma.InputJsonValue,
        teamId: TEAMS[i % TEAMS.length]!.id,
        quarter: "Q1",
        year: q1.year,
        measurementUnit: tmpl.unit,
        target,
        quarterlyGoal: target,
        qtdGoal: target,
        divisionType: "Cumulative",
        weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
        targetScale: tmpl.scale,
        frequency: "weekly",
        status: "active",
        healthStatus: "on-track",
        reverseColor: false,
        createdBy: ASHWIN_ID,
      },
    });

    // Each owner contributes weekly values
    const weeksWithActuals = Math.min(currentWeek - 1, randInt(5, 10));
    let qtdAchieved = 0;
    for (const ownerId of ownerIds) {
      const ownerTargetPerWeek = target / 13 / ownerIds.length;
      for (let w = 1; w <= weeksWithActuals; w++) {
        const actual = ownerTargetPerWeek * (0.7 + Math.random() * 0.5);
        await prisma.kPIWeeklyValue.create({
          data: {
            tenantId: TENANT_ID,
            kpiId: kpi.id,
            userId: ownerId,
            weekNumber: w,
            value: Math.round(actual * 100) / 100,
            createdBy: ownerId,
          },
        });
        qtdAchieved += actual;
        weeklyTotal++;
      }
    }
    await prisma.kPI.update({
      where: { id: kpi.id },
      data: { qtdAchieved: Math.round(qtdAchieved * 100) / 100 },
    });
  }
  console.log(`  ✓ ${TEAM_KPI_POOL.length} team KPIs (+ ${weeklyTotal} weekly value rows)\n`);
}

async function seedPriorities() {
  console.log("🎯 Creating priorities (1-2 per member)…");
  let total = 0;
  for (const member of ALL_MEMBERS) {
    const count = randInt(1, 2);
    const picks = pickN(PRIORITY_TEMPLATES, count);
    for (const name of picks) {
      const status = rand(PRIORITY_STATUSES);
      const teamId = rand([TEAMS[0]!.id, TEAMS[1]!.id, null]);
      await prisma.priority.create({
        data: {
          tenantId: TENANT_ID,
          name,
          description: `Demo priority owned by ${member.name}`,
          owner: member.id,
          teamId,
          quarter: "Q1",
          year: 2026,
          startWeek: randInt(1, 6),
          endWeek: randInt(7, 13),
          overallStatus: status,
          createdBy: member.id,
        },
      });
      total++;
    }
  }
  console.log(`  ✓ ${total} priorities\n`);
}

async function seedWWW() {
  console.log("🌟 Creating WWW items (3-5 per member)…");
  let total = 0;
  for (const member of ALL_MEMBERS) {
    const count = randInt(3, 5);
    const picks = pickN(WWW_TEMPLATES, count);
    for (const what of picks) {
      const daysAgo = randInt(1, 60);
      const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      await prisma.wWWItem.create({
        data: {
          tenantId: TENANT_ID,
          who: member.id,
          what,
          when,
          status: rand(["completed", "on-track", "in-progress", "completed"]),
          category: rand(["Wins", "Lessons", "Recognition", "Milestones"]),
          createdBy: member.id,
        },
      });
      total++;
    }
  }
  console.log(`  ✓ ${total} WWW items\n`);
}

async function seedOPSP() {
  console.log("📋 Creating filled OPSP for FY2026 Q1…");
  await prisma.oPSPData.create({
    data: {
      tenantId: TENANT_ID,
      userId: ASHWIN_ID,
      year: 2026,
      quarter: "Q1",
      status: "finalized",
      targetYears: 5,
      employees: ["Top talent", "Continuous learning", "Team-first culture"] as Prisma.InputJsonValue,
      customers: ["Enterprise SaaS", "Mid-market", "SMB"] as Prisma.InputJsonValue,
      shareholders: ["Founders", "Angel investors", "Series A"] as Prisma.InputJsonValue,
      coreValues: "Speed. Trust. Outcomes.",
      purpose: "Help mid-market companies execute on their growth strategy.",
      actions: ["Ship faster", "Listen harder", "Measure twice", "Bias to action", "Stay humble"] as Prisma.InputJsonValue,
      profitPerX: "Profit per Customer Account",
      bhag: "Become the OS for scaling-up businesses across India by 2030.",
      targetRows: [
        { category: "Revenue", projected: "50", y1: "8", y2: "10", y3: "12", y4: "10", y5: "10" },
        { category: "Customers", projected: "500", y1: "50", y2: "100", y3: "150", y4: "100", y5: "100" },
      ] as Prisma.InputJsonValue,
      sandbox: "India SMB + mid-market SaaS",
      keyThrusts: [
        { desc: "Launch v2 platform", owner: "Ashwin" },
        { desc: "Hire 5 senior engineers", owner: "Dhwani" },
        { desc: "Sign 10 enterprise deals", owner: "Himanshu" },
        { desc: "Build customer success motion", owner: "Rohit" },
        { desc: "Expand to 3 new regions", owner: "Ashwin" },
      ] as Prisma.InputJsonValue,
      brandPromiseKPIs: "NPS > 70, Churn < 5%",
      brandPromise: "Done in days, not quarters.",
      goalRows: [
        { category: "Revenue", projected: "10", q1: "2", q2: "3", q3: "3", q4: "2" },
      ] as Prisma.InputJsonValue,
      keyInitiatives: [
        { desc: "Launch beta v2", owner: "Ashwin" },
        { desc: "Hire 2 engineers", owner: "Dhwani" },
        { desc: "Close 3 deals", owner: "Himanshu" },
        { desc: "First customer success hire", owner: "Rohit" },
        { desc: "Stage Bangalore launch", owner: "Ashwin" },
      ] as Prisma.InputJsonValue,
      criticalNumGoals: { title: "₹2cr Revenue", bullets: ["Sign 5 deals", "Avg ACV ₹40L", "0 churn", "NPS 70+"] } as Prisma.InputJsonValue,
      balancingCritNumGoals: { title: "Customer Satisfaction", bullets: ["NPS > 70", "Response < 4h", "Feature parity"] } as Prisma.InputJsonValue,
      createdBy: ASHWIN_ID,
    },
  });
  console.log("  ✓ 1 OPSP (finalized) for FY2026 Q1\n");
}

async function seedMeetingRhythm() {
  console.log("🗓️  Creating meeting rhythm (1 client + 4 members + huddles + meetings)…");

  // Client (the "team" we're tracking meetings for — internal Moreyeahs team)
  const client = await prisma.client.create({
    data: {
      id: "clientmoreyeahsdemo001",
      tenantId: TENANT_ID,
      name: "Moreyeahs Internal Team",
      description: "Internal weekly cadence for the Moreyeahs leadership team",
      isActive: true,
      startDate: new Date("2026-04-01"),
      weeklyStartTime: "09:00",
      weeklyEndTime: "10:30",
      dailyStartTime: "09:00",
      dailyEndTime: "09:15",
      createdBy: ASHWIN_ID,
    },
  });

  // 4 ClientMembers (one per team member)
  const memberIdMap = new Map<string, string>();
  for (const m of ALL_MEMBERS) {
    const cm = await prisma.clientMember.create({
      data: {
        tenantId: TENANT_ID,
        name: m.name,
        email: NEW_USERS.find(u => u.id === m.id)?.email ?? "ashwin@moreyeahs.com",
        createdBy: ASHWIN_ID,
      },
    });
    memberIdMap.set(m.id, cm.id);
  }

  // 3 Daily Huddles (last 3 weekdays)
  const today = new Date();
  let dailyCount = 0;
  for (let d = 1; d <= 5; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
    if (dailyCount >= 3) break;
    await prisma.clientDailyHuddle.create({
      data: {
        tenantId: TENANT_ID,
        clientId: client.id,
        meetingDate: date,
        callStatus: "HELD",
        actualStartTime: "09:02",
        actualEndTime: "09:14",
        format1Status: "YES",
        format2Status: "YES",
        stuckCallStatus: "NO",
        punctualityOverride: "YES",
        totalMembers: 4,
        notes: `Daily huddle on ${date.toDateString()}`,
        createdBy: ASHWIN_ID,
      },
    });
    dailyCount++;
  }
  console.log(`  ✓ 1 client + ${ALL_MEMBERS.length} client members + ${dailyCount} daily huddles`);

  // 2 Weekly Meetings (last 2 Mondays)
  let weeklyCount = 0;
  const dayOfWeek = today.getDay();
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  for (let w = 0; w < 2; w++) {
    const meetingDate = new Date(lastMonday);
    meetingDate.setDate(lastMonday.getDate() - w * 7);
    await prisma.clientWeeklyMeeting.create({
      data: {
        tenantId: TENANT_ID,
        clientId: client.id,
        meetingDate,
        callStatus: "HELD",
        actualStartTime: "09:01",
        actualEndTime: "10:32",
        segmentTime1: "09:05",
        segmentTime2: "09:15",
        segmentTime3: "09:30",
        segmentTime4: "09:50",
        segmentTime5: "10:05",
        segmentTime6: "10:15",
        segmentTime7: "10:25",
        goodNewsSharing: "YES",
        kpDashboard: "YES",
        gaps: "NO",
        www: "YES",
        feedback: "YES",
        collectiveIntelligence: "YES",
        opspReview: "YES",
        notesKPDashboard: "Reviewed all KPIs — Service Revenue tracking well",
        otherNotes: `Weekly L10 on ${meetingDate.toDateString()}`,
        createdBy: ASHWIN_ID,
      },
    });
    weeklyCount++;
  }
  console.log(`  ✓ ${weeklyCount} weekly meetings\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("❌ Refusing to run without --confirm flag.");
    process.exit(1);
  }

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Moreyeahs Demo Seed");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  Members: Ashwin (admin), Dhwani (manager), Himanshu+Rohit (employee)`);
  console.log("══════════════════════════════════════════════════════════════\n");

  await wipeDemoData();
  await seedTenantSettings();
  await seedNewUsers();
  await seedTeams();
  await seedQuarters();
  await seedCategories();
  await seedAccountabilityFunctions();
  await seedIndividualKPIs();
  await seedTeamKPIs();
  await seedPriorities();
  await seedWWW();
  await seedOPSP();
  await seedMeetingRhythm();

  // Final counts
  const [u, m, t, q, c, af, k, kw, p, w, op, cl, cm, dh, wm] = await Promise.all([
    prisma.user.count({ where: { id: { in: [ASHWIN_ID, ...NEW_USERS.map(u => u.id)] } } }),
    prisma.orgMember.count({ where: { tenantId: TENANT_ID } }),
    prisma.team.count({ where: { tenantId: TENANT_ID } }),
    prisma.quarterSetting.count({ where: { tenantId: TENANT_ID } }),
    prisma.categoryMaster.count({ where: { tenantId: TENANT_ID } }),
    prisma.accountabilityFunction.count({ where: { tenantId: TENANT_ID } }),
    prisma.kPI.count({ where: { tenantId: TENANT_ID } }),
    prisma.kPIWeeklyValue.count({ where: { tenantId: TENANT_ID } }),
    prisma.priority.count({ where: { tenantId: TENANT_ID } }),
    prisma.wWWItem.count({ where: { tenantId: TENANT_ID } }),
    prisma.oPSPData.count({ where: { tenantId: TENANT_ID } }),
    prisma.client.count({ where: { tenantId: TENANT_ID } }),
    prisma.clientMember.count({ where: { tenantId: TENANT_ID } }),
    prisma.clientDailyHuddle.count({ where: { tenantId: TENANT_ID } }),
    prisma.clientWeeklyMeeting.count({ where: { tenantId: TENANT_ID } }),
  ]);

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  ✅ Done. Final counts (Moreyeahs tenant):");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Users (in scope):       ${u}`);
  console.log(`  Memberships:            ${m}`);
  console.log(`  Teams:                  ${t}`);
  console.log(`  Quarter settings:       ${q}`);
  console.log(`  Categories:             ${c}`);
  console.log(`  Accountability funcs:   ${af}`);
  console.log(`  KPIs (indiv + team):    ${k}`);
  console.log(`  KPI weekly values:      ${kw}`);
  console.log(`  Priorities:             ${p}`);
  console.log(`  WWW items:              ${w}`);
  console.log(`  OPSP:                   ${op}`);
  console.log(`  Clients:                ${cl}`);
  console.log(`  Client members:         ${cm}`);
  console.log(`  Daily huddles:          ${dh}`);
  console.log(`  Weekly meetings:        ${wm}`);
}

main()
  .catch(e => {
    console.error("❌ FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
