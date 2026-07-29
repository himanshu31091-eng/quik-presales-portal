/**
 * Full seed — populates ALL QuikScale tables with realistic data.
 *
 * Preserves existing users (Ashwin + Dhwani) and adds 3 new ones.
 * Run: set -a && source apps/quikscale/.env && set +a && npx tsx packages/database/prisma/seed-full.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/* ── Constants ── */
const TENANT_ID = "cmniw5uyu000042zwp613fjug";
const ASHWIN_ID = "cmniw5v0l000142zwvwozcvpq";
const DHWANI_ID = "cmnx9x36d0004bh317swzz5g8";
const YEAR = 2026;
const QUARTER = "Q1";

async function main() {
  console.log("🌱 Starting full database seed...\n");

  const hashed = await bcrypt.hash("Test@1234", 10);

  /* ═══════════════════════════════════════════════
     1. NEW USERS (3)
     ═══════════════════════════════════════════════ */
  const rahul = await prisma.user.upsert({
    where: { email: "rahul@moreyeahs.com" },
    update: {},
    create: {
      email: "rahul@moreyeahs.com",
      firstName: "Rahul",
      lastName: "Patel",
      password: hashed,
    },
  });

  const meera = await prisma.user.upsert({
    where: { email: "meera@moreyeahs.com" },
    update: {},
    create: {
      email: "meera@moreyeahs.com",
      firstName: "Meera",
      lastName: "Gupta",
      password: hashed,
    },
  });

  const vikram = await prisma.user.upsert({
    where: { email: "vikram@moreyeahs.com" },
    update: {},
    create: {
      email: "vikram@moreyeahs.com",
      firstName: "Vikram",
      lastName: "Singh",
      password: hashed,
    },
  });

  console.log("✅ 3 new users created (rahul, meera, vikram) — password: Test@1234");

  /* ═══════════════════════════════════════════════
     2. TEAMS (4)
     ═══════════════════════════════════════════════ */
  const engineering = await prisma.team.upsert({
    where: { id: "team-engineering" },
    update: {},
    create: {
      id: "team-engineering",
      tenantId: TENANT_ID,
      name: "Engineering",
      slug: "engineering",
      color: "#3b82f6",
    },
  });

  const sales = await prisma.team.upsert({
    where: { id: "team-sales" },
    update: {},
    create: {
      id: "team-sales",
      tenantId: TENANT_ID,
      name: "Sales",
      slug: "sales",
      color: "#8b5cf6",
    },
  });

  const marketing = await prisma.team.upsert({
    where: { id: "team-marketing" },
    update: {},
    create: {
      id: "team-marketing",
      tenantId: TENANT_ID,
      name: "Marketing",
      slug: "marketing",
      color: "#f59e0b",
    },
  });

  const operations = await prisma.team.upsert({
    where: { id: "team-operations" },
    update: {},
    create: {
      id: "team-operations",
      tenantId: TENANT_ID,
      name: "Operations",
      slug: "operations",
      color: "#10b981",
    },
  });

  console.log("✅ 4 teams created");

  /* ═══════════════════════════════════════════════
     3. MEMBERSHIPS for new users + team assignments
     ═══════════════════════════════════════════════ */
  // Rahul — manager of Engineering
  await prisma.orgMember.upsert({
    where: { id: "mem-rahul" },
    update: {},
    create: {
      id: "mem-rahul",
      tenantId: TENANT_ID,
      userId: rahul.id,
      role: "manager",
      status: "active",
      teamId: engineering.id,
    },
  });

  // Meera — team_head of Sales
  await prisma.orgMember.upsert({
    where: { id: "mem-meera" },
    update: {},
    create: {
      id: "mem-meera",
      tenantId: TENANT_ID,
      userId: meera.id,
      role: "team_head",
      status: "active",
      teamId: sales.id,
    },
  });

  // Vikram — employee in Marketing
  await prisma.orgMember.upsert({
    where: { id: "mem-vikram" },
    update: {},
    create: {
      id: "mem-vikram",
      tenantId: TENANT_ID,
      userId: vikram.id,
      role: "employee",
      status: "active",
      teamId: marketing.id,
    },
  });

  // UserTeam cross-assignments
  const userTeams = [
    { userId: ASHWIN_ID, teamId: engineering.id },
    { userId: ASHWIN_ID, teamId: operations.id },
    { userId: DHWANI_ID, teamId: sales.id },
    { userId: DHWANI_ID, teamId: marketing.id },
    { userId: rahul.id, teamId: engineering.id },
    { userId: meera.id, teamId: sales.id },
    { userId: meera.id, teamId: marketing.id },
    { userId: vikram.id, teamId: marketing.id },
    { userId: vikram.id, teamId: operations.id },
  ];

  for (const ut of userTeams) {
    await prisma.userTeam.upsert({
      where: {
        tenantId_userId_teamId: {
          tenantId: TENANT_ID,
          userId: ut.userId,
          teamId: ut.teamId,
        },
      },
      update: {},
      create: { tenantId: TENANT_ID, ...ut },
    });
  }

  console.log("✅ Memberships + team assignments created");

  /* ═══════════════════════════════════════════════
     4. CATEGORIES (add Revenue + Clients)
     ═══════════════════════════════════════════════ */
  await prisma.categoryMaster.upsert({
    where: { id: "cat-revenue" },
    update: {},
    create: {
      id: "cat-revenue",
      tenantId: TENANT_ID,
      name: "Revenue",
      dataType: "Currency",
      currency: "INR",
      createdBy: ASHWIN_ID,
    },
  });

  await prisma.categoryMaster.upsert({
    where: { id: "cat-clients" },
    update: {},
    create: {
      id: "cat-clients",
      tenantId: TENANT_ID,
      name: "Clients",
      dataType: "Number",
      createdBy: ASHWIN_ID,
    },
  });

  await prisma.categoryMaster.upsert({
    where: { id: "cat-profit" },
    update: {},
    create: {
      id: "cat-profit",
      tenantId: TENANT_ID,
      name: "Profit Margin",
      dataType: "Percentage",
      createdBy: ASHWIN_ID,
    },
  });

  console.log("✅ 3 additional categories created (Revenue, Clients, Profit Margin)");

  /* ═══════════════════════════════════════════════
     5. KPIs — company → team → individual hierarchy
     ═══════════════════════════════════════════════ */
  const kpiRevenue = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Quarterly Revenue",
      description: "Total revenue target for Q1 FY26",
      owner: ASHWIN_ID,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "individual",
      measurementUnit: "Currency",
      currency: "INR",
      target: 5000000,
      quarterlyGoal: 5000000,
      qtdGoal: 5000000,
      qtdAchieved: 3200000,
      progressPercent: 64,
      status: "active",
      healthStatus: "behind-schedule",
      createdBy: ASHWIN_ID,
    },
  });

  const kpiClients = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "New Client Acquisitions",
      description: "New clients signed this quarter",
      owner: DHWANI_ID,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "individual",
      measurementUnit: "Number",
      target: 15,
      quarterlyGoal: 15,
      qtdGoal: 15,
      qtdAchieved: 8,
      progressPercent: 53,
      status: "active",
      healthStatus: "behind-schedule",
      createdBy: ASHWIN_ID,
    },
  });

  const kpiSalesTeam = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Sales Pipeline Value",
      description: "Total pipeline in sales funnel",
      owner: meera.id,
      teamId: sales.id,
      parentKPIId: kpiRevenue.id,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "team",
      measurementUnit: "Currency",
      currency: "INR",
      target: 2000000,
      quarterlyGoal: 2000000,
      qtdGoal: 2000000,
      qtdAchieved: 1450000,
      progressPercent: 72,
      status: "active",
      healthStatus: "on-track",
      createdBy: meera.id,
    },
  });

  const kpiEngTeam = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Sprint Velocity",
      description: "Story points per sprint",
      owner: rahul.id,
      teamId: engineering.id,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "team",
      measurementUnit: "Number",
      target: 120,
      quarterlyGoal: 120,
      qtdGoal: 120,
      qtdAchieved: 95,
      progressPercent: 79,
      status: "active",
      healthStatus: "on-track",
      createdBy: rahul.id,
    },
  });

  const kpiIndividual1 = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Deals Closed",
      description: "Number of deals closed by Meera",
      owner: meera.id,
      teamId: sales.id,
      parentKPIId: kpiSalesTeam.id,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "individual",
      measurementUnit: "Number",
      target: 8,
      quarterlyGoal: 8,
      qtdGoal: 8,
      qtdAchieved: 5,
      progressPercent: 62,
      status: "active",
      healthStatus: "behind-schedule",
      createdBy: meera.id,
    },
  });

  const kpiIndividual2 = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Campaigns Launched",
      description: "Marketing campaigns executed",
      owner: vikram.id,
      teamId: marketing.id,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "individual",
      measurementUnit: "Number",
      target: 6,
      quarterlyGoal: 6,
      qtdGoal: 6,
      qtdAchieved: 4,
      progressPercent: 67,
      status: "active",
      healthStatus: "on-track",
      createdBy: ASHWIN_ID,
    },
  });

  const kpiIndividual3 = await prisma.kPI.create({
    data: {
      tenantId: TENANT_ID,
      name: "Bug Resolution Rate",
      description: "Bugs resolved per week",
      owner: rahul.id,
      teamId: engineering.id,
      parentKPIId: kpiEngTeam.id,
      quarter: QUARTER,
      year: YEAR,
      kpiLevel: "individual",
      measurementUnit: "Number",
      target: 25,
      quarterlyGoal: 25,
      qtdGoal: 25,
      qtdAchieved: 18,
      progressPercent: 72,
      status: "active",
      healthStatus: "on-track",
      createdBy: rahul.id,
    },
  });

  console.log("✅ 7 KPIs created (2 company, 2 team, 3 individual)");

  /* ── KPI Weekly Values (weeks 1-2 filled, rest empty) ── */
  const allKPIs = [
    { kpi: kpiRevenue, weeklyTargets: [385000, 385000] },
    { kpi: kpiClients, weeklyTargets: [1, 1] },
    { kpi: kpiSalesTeam, weeklyTargets: [154000, 154000] },
    { kpi: kpiEngTeam, weeklyTargets: [9, 9] },
    { kpi: kpiIndividual1, weeklyTargets: [1, 1] },
    { kpi: kpiIndividual2, weeklyTargets: [0, 1] },
    { kpi: kpiIndividual3, weeklyTargets: [2, 2] },
  ];

  for (const { kpi, weeklyTargets } of allKPIs) {
    for (let week = 1; week <= 2; week++) {
      const target = weeklyTargets[week - 1] ?? weeklyTargets[0] ?? 0;
      // Randomize achieved: 70%-130% of target
      const achieved = Math.round(target * (0.7 + Math.random() * 0.6));
      await prisma.kPIWeeklyValue.create({
        data: {
          tenantId: TENANT_ID,
          kpiId: kpi.id,
          weekNumber: week,
          value: achieved,
          createdBy: kpi.owner,
        },
      });
    }
  }

  console.log("✅ KPI weekly values seeded (weeks 1-2 filled)");

  /* ═══════════════════════════════════════════════
     6. PRIORITIES (5) with weekly statuses
     ═══════════════════════════════════════════════ */
  const priorities = [
    { name: "Launch Product V2.0", owner: ASHWIN_ID, status: "on-track" },
    { name: "Close Enterprise Deal — Acme Corp", owner: meera.id, status: "behind-schedule" },
    { name: "Hire 3 Senior Engineers", owner: rahul.id, status: "on-track" },
    { name: "SEO Overhaul & Content Strategy", owner: vikram.id, status: "not-started" },
    { name: "Implement SOC-2 Compliance", owner: DHWANI_ID, status: "on-track" },
  ];

  for (const p of priorities) {
    const pri = await prisma.priority.create({
      data: {
        tenantId: TENANT_ID,
        name: p.name,
        owner: p.owner,
        quarter: QUARTER,
        year: YEAR,
        startWeek: 1,
        endWeek: 13,
        overallStatus: p.status,
        createdBy: ASHWIN_ID,
      },
    });

    // Weekly statuses
    const statusOptions = ["on-track", "behind-schedule", "completed", "not-started"];
    for (let w = 1; w <= 13; w++) {
      await prisma.priorityWeeklyStatus.create({
        data: {
          priorityId: pri.id,
          weekNumber: w,
          status: w <= 2 ? (w === 2 && p.status === "behind-schedule" ? "behind-schedule" : "on-track") : "not-started",
        },
      });
    }
  }

  console.log("✅ 5 priorities with weekly statuses");

  /* ═══════════════════════════════════════════════
     7. WWW ITEMS (8)
     ═══════════════════════════════════════════════ */
  const wwwItems = [
    { who: rahul.id, what: "Complete API documentation for V2", daysOut: 3, status: "in-progress" },
    { who: meera.id, what: "Send proposal to Acme Corp", daysOut: 2, status: "in-progress" },
    { who: vikram.id, what: "Design social media campaign for Q1", daysOut: 5, status: "not-started" },
    { who: ASHWIN_ID, what: "Review quarterly board deck", daysOut: 7, status: "not-started" },
    { who: DHWANI_ID, what: "Finalize SOC-2 audit schedule", daysOut: 4, status: "in-progress" },
    { who: rahul.id, what: "Set up CI/CD pipeline for staging", daysOut: -2, status: "completed" },
    { who: meera.id, what: "Follow up with TechStart lead", daysOut: 1, status: "in-progress" },
    { who: vikram.id, what: "Create onboarding email sequence", daysOut: 10, status: "not-started" },
  ];

  for (const item of wwwItems) {
    await prisma.wWWItem.create({
      data: {
        tenantId: TENANT_ID,
        who: item.who,
        what: item.what,
        when: new Date(Date.now() + item.daysOut * 86400000),
        status: item.status,
        createdBy: ASHWIN_ID,
      },
    });
  }

  console.log("✅ 8 WWW items created");

  /* ═══════════════════════════════════════════════
     8. MEETING TEMPLATES (3) + MEETINGS (5)
     ═══════════════════════════════════════════════ */
  const templateWeekly = await prisma.meetingTemplate.create({
    data: {
      tenantId: TENANT_ID,
      name: "Weekly L10 Meeting",
      cadence: "weekly",
      duration: 60,
      description: "Scaling Up weekly L10 format",
      sections: ["Good news", "Scorecard review", "Rock review", "Customer/employee headlines", "To-do list", "IDS", "Conclude"],
      createdBy: ASHWIN_ID,
    },
  });

  await prisma.meetingTemplate.create({
    data: {
      tenantId: TENANT_ID,
      name: "Daily Huddle",
      cadence: "daily",
      duration: 15,
      description: "15-minute daily standup",
      sections: ["What's up?", "Daily metrics", "Where am I stuck?"],
      createdBy: ASHWIN_ID,
    },
  });

  await prisma.meetingTemplate.create({
    data: {
      tenantId: TENANT_ID,
      name: "Monthly Strategic Review",
      cadence: "monthly",
      duration: 120,
      description: "Monthly deep-dive into strategy execution",
      sections: ["KPI deep dive", "Priority progress", "Financial review", "Strategic issues", "Action items"],
      createdBy: ASHWIN_ID,
    },
  });

  // Meetings
  const meetingDates = [
    new Date("2026-04-07T10:00:00Z"),
    new Date("2026-04-14T10:00:00Z"),
    new Date("2026-04-01T09:00:00Z"),
    new Date("2026-04-10T14:00:00Z"),
    new Date("2026-04-03T11:00:00Z"),
  ];

  const meetingDefs = [
    { name: "Weekly Sync — Engineering", cadence: "weekly" as const, dur: 60, loc: "Conference Room A" },
    { name: "Weekly Sync — All Hands", cadence: "weekly" as const, dur: 90, loc: "Zoom" },
    { name: "Monthly Board Review", cadence: "monthly" as const, dur: 120, loc: "Boardroom" },
    { name: "Sales Pipeline Review", cadence: "weekly" as const, dur: 45, loc: "Zoom" },
    { name: "Sprint Retrospective", cadence: "weekly" as const, dur: 60, loc: "Conference Room B" },
  ];

  const allUserIds = [ASHWIN_ID, DHWANI_ID, rahul.id, meera.id, vikram.id];

  for (let i = 0; i < meetingDefs.length; i++) {
    const m = meetingDefs[i];
    const meeting = await prisma.meeting.create({
      data: {
        tenantId: TENANT_ID,
        name: m.name,
        cadence: m.cadence,
        scheduledAt: meetingDates[i],
        duration: m.dur,
        location: m.loc,
        agenda: `Agenda for ${m.name}`,
        startedOnTime: i < 3,
        endedOnTime: i < 2,
        formatFollowed: i < 4,
        completedAt: i === 0 ? meetingDates[0] : null,
        createdBy: ASHWIN_ID,
      },
    });

    // Add 3-5 attendees per meeting
    const attendeeCount = 3 + (i % 3);
    for (let a = 0; a < attendeeCount; a++) {
      await prisma.meetingAttendee.create({
        data: {
          meetingId: meeting.id,
          userId: allUserIds[a % allUserIds.length],
          attended: a < attendeeCount - 1, // last person didn't attend
        },
      });
    }
  }

  console.log("✅ 3 templates + 5 meetings with attendees");

  /* ═══════════════════════════════════════════════
     9. DAILY HUDDLES (5 days)
     ═══════════════════════════════════════════════ */
  for (let d = 0; d < 5; d++) {
    const huddleDate = new Date("2026-04-07T00:00:00Z");
    huddleDate.setDate(huddleDate.getDate() + d);

    await prisma.dailyHuddle.create({
      data: {
        tenantId: TENANT_ID,
        meetingDate: huddleDate,
        callStatus: d < 4 ? "Held" : "Scheduled",
        actualStartTime: "09:00",
        actualEndTime: "09:15",
        yesterdaysAchievements: d > 0,
        stuckIssues: d === 2,
        todaysPriority: true,
        notesKPDashboard: d === 2 ? "Blocked on third-party API integration" : null,
        otherNotes: d === 0 ? "First huddle of the week — good energy" : null,
        absentMembers: d === 3 ? vikram.id : null,
        createdBy: ASHWIN_ID,
      },
    });
  }

  console.log("✅ 5 daily huddles");

  /* ═══════════════════════════════════════════════
     10. OPSP DATA for Dhwani (2nd user) — draft
     ═══════════════════════════════════════════════ */
  await prisma.oPSPData.upsert({
    where: {
      tenantId_userId_year_quarter: {
        tenantId: TENANT_ID,
        userId: DHWANI_ID,
        year: YEAR,
        quarter: QUARTER,
      },
    },
    update: {},
    create: {
      tenantId: TENANT_ID,
      userId: DHWANI_ID,
      year: YEAR,
      quarter: QUARTER,
      status: "draft",
      targetYears: 5,
      createdBy: DHWANI_ID,
      // PEOPLE
      employees: ["Build A-players", "Retain top talent", "Develop future leaders"],
      customers: ["Enterprise SaaS companies", "Mid-market tech firms", "Scaling startups"],
      shareholders: ["Revenue growth 40% YoY", "Profitability by Q3", "Market expansion"],
      // CORE
      coreValues: "Innovation · Integrity · Customer Obsession · Teamwork · Excellence",
      purpose: "To empower businesses with scalable technology solutions that drive measurable growth",
      actions: ["Launch QuikScale v2", "Expand to 3 new markets", "Achieve SOC-2", "Build partner channel", "Hire 15 engineers"],
      profitPerX: "Profit per employee: ₹12L",
      bhag: "Become the #1 strategic execution platform in Asia-Pacific by 2030",
      // TARGETS (3-5 yr)
      targetRows: [
        { category: "Revenue", projected: "50 Cr", y1: "10 Cr", y2: "15 Cr", y3: "20 Cr", y4: "30 Cr", y5: "50 Cr" },
        { category: "Clients", projected: "500", y1: "80", y2: "150", y3: "250", y4: "380", y5: "500" },
        { category: "Profit Margin", projected: "25", y1: "5", y2: "10", y3: "15", y4: "20", y5: "25" },
        { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
        { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
      ],
      sandbox: "Explore AI-powered strategic planning assistant. Consider white-label offering for consultants.",
      keyThrusts: [
        { desc: "Product-led growth engine", owner: ASHWIN_ID },
        { desc: "Enterprise sales motion", owner: meera.id },
        { desc: "Platform reliability & scale", owner: rahul.id },
        { desc: "Brand authority in execution space", owner: vikram.id },
        { desc: "Operational excellence & SOC-2", owner: DHWANI_ID },
      ],
      brandPromiseKPIs: "NPS > 50, Uptime 99.9%, Onboarding < 2 days",
      brandPromise: "We make strategic execution simple, measurable, and repeatable.",
      // GOALS (1 yr)
      goalRows: [
        { category: "Revenue", projected: "10 Cr", q1: "2 Cr", q2: "2.5 Cr", q3: "2.5 Cr", q4: "3 Cr" },
        { category: "Clients", projected: "80", q1: "15", q2: "20", q3: "20", q4: "25" },
        { category: "Profit Margin", projected: "5", q1: "0", q2: "1", q3: "2", q4: "5" },
        { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
        { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
        { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      ],
      keyInitiatives: [
        { desc: "Launch QuikScale v2 with OPSP Review module", owner: rahul.id },
        { desc: "Close 5 enterprise accounts > ₹20L ARR each", owner: meera.id },
        { desc: "Achieve SOC-2 Type II certification", owner: DHWANI_ID },
        { desc: "Build content engine: 50 blogs, 10 case studies", owner: vikram.id },
        { desc: "Reduce churn rate to < 5%", owner: ASHWIN_ID },
      ],
      criticalNumGoals: { title: "Revenue Growth", bullets: ["Q1 target: ₹2 Cr", "Pipeline: ₹5 Cr", "Win rate: 30%", "Avg deal: ₹15L"] },
      balancingCritNumGoals: { title: "Team Health", bullets: ["eNPS > 40", "Attrition < 10%", "Training hours: 20/person", "1:1 completion: 100%"] },
      // ACTIONS QTR
      actionsQtr: [
        { category: "Revenue", projected: "2 Cr", m1: "50 L", m2: "70 L", m3: "80 L" },
        { category: "Clients", projected: "15", m1: "4", m2: "5", m3: "6" },
        { category: "Profit Margin", projected: "0", m1: "0", m2: "0", m3: "0" },
        { category: "", projected: "", m1: "", m2: "", m3: "" },
        { category: "", projected: "", m1: "", m2: "", m3: "" },
        { category: "", projected: "", m1: "", m2: "", m3: "" },
      ],
      rocks: [
        { desc: "Ship OPSP Review module to production", owner: rahul.id },
        { desc: "Sign 3 enterprise POCs", owner: meera.id },
        { desc: "Complete SOC-2 readiness assessment", owner: DHWANI_ID },
        { desc: "Launch company blog with 15 posts", owner: vikram.id },
        { desc: "Implement automated onboarding flow", owner: ASHWIN_ID },
      ],
      criticalNumProcess: { title: "Delivery Velocity", bullets: ["Sprint velocity: 120 pts", "Release frequency: weekly", "Bug escape rate: < 2%", "Deploy time: < 15 min"] },
      balancingCritNumProcess: { title: "Quality", bullets: ["Test coverage: > 70%", "P1 incidents: 0", "Code review turnaround: < 4h", "Tech debt ratio: < 15%"] },
      // THEME
      theme: "Scaling to ₹10 Cr — Foundation Quarter",
      scoreboardDesign: "Weekly revenue dashboard + KPI traffic lights on TV in office",
      celebration: "Team dinner at milestone of ₹5 Cr pipeline",
      reward: "Top performer gets extra 3 days PTO + ₹25K bonus",
      // ACCOUNTABILITY
      kpiAccountability: [
        { kpi: "Revenue", goal: "₹2 Cr" },
        { kpi: "New Clients", goal: "15" },
        { kpi: "Sprint Velocity", goal: "120 pts" },
        { kpi: "NPS Score", goal: "> 50" },
        { kpi: "Employee Satisfaction", goal: "eNPS > 40" },
      ],
      quarterlyPriorities: [
        { priority: "Launch V2", dueDate: "2026-06-15" },
        { priority: "Enterprise POCs", dueDate: "2026-05-30" },
        { priority: "SOC-2 readiness", dueDate: "2026-06-30" },
        { priority: "Content engine", dueDate: "2026-06-15" },
        { priority: "Onboarding automation", dueDate: "2026-05-15" },
      ],
      criticalNumAcct: { title: "Accountability Score", bullets: ["Weekly check-ins: 100%", "Rock completion: > 80%", "Meeting rhythm: 95%", "KPI updates: weekly"] },
      balancingCritNumAcct: { title: "Work-Life Balance", bullets: ["No weekend work", "Max 45h/week", "All PTO taken", "Mental health days available"] },
      // TRENDS
      trends: [
        "AI-powered business tools adoption accelerating",
        "Remote-first teams need better execution visibility",
        "Enterprise buyers demand SOC-2 and ISO 27001",
        "PLG motion replacing traditional sales in SMB",
        "India SaaS ecosystem growing 30% YoY",
        "Strategic execution software market consolidating",
      ],
    },
  });

  console.log("✅ OPSP data created for Dhwani (draft, fully populated)");

  /* ═══════════════════════════════════════════════
     11. OPSP REVIEW ENTRIES (for Dhwani's OPSP)
     ═══════════════════════════════════════════════ */
  const dhwaniOPSP = await prisma.oPSPData.findUnique({
    where: {
      tenantId_userId_year_quarter: {
        tenantId: TENANT_ID,
        userId: DHWANI_ID,
        year: YEAR,
        quarter: QUARTER,
      },
    },
    select: { id: true },
  });

  if (dhwaniOPSP) {
    // Quarter (actions) — m1 filled, m2 partial
    const reviewEntries = [
      // Revenue row (index 0)
      { horizon: "quarter", rowIndex: 0, category: "Revenue", period: "m1", target: 5000000, achieved: 4200000, comment: "April collections delayed by 3 days" },
      { horizon: "quarter", rowIndex: 0, category: "Revenue", period: "m2", target: 7000000, achieved: 5800000, comment: "Two large deals slipped to June" },
      // Clients row (index 1)
      { horizon: "quarter", rowIndex: 1, category: "Clients", period: "m1", target: 4, achieved: 5, comment: "Exceeded — referral pipeline strong" },
      { horizon: "quarter", rowIndex: 1, category: "Clients", period: "m2", target: 5, achieved: 3, comment: "Enterprise cycle slower than expected" },
      // Yearly (goals) — q1 filled
      { horizon: "yearly", rowIndex: 0, category: "Revenue", period: "q1", target: 20000000, achieved: 16500000, comment: "Q1 below target due to delayed enterprise closures" },
      { horizon: "yearly", rowIndex: 1, category: "Clients", period: "q1", target: 15, achieved: 12, comment: "Strong SMB, weak enterprise" },
      // 3-5 year (targets) — y1 filled
      { horizon: "3to5year", rowIndex: 0, category: "Revenue", period: "y1", target: 100000000, achieved: 82000000, comment: "Year 1 tracking at 82% — need Q4 push" },
      { horizon: "3to5year", rowIndex: 1, category: "Clients", period: "y1", target: 80, achieved: 65, comment: "Client acquisition on track for adjusted forecast" },
      { horizon: "3to5year", rowIndex: 2, category: "Profit Margin", period: "y1", target: 5, achieved: 3, comment: "Margins improving — hiring costs front-loaded" },
    ];

    for (const entry of reviewEntries) {
      await prisma.oPSPReviewEntry.upsert({
        where: {
          tenantId_opspId_horizon_rowIndex_period: {
            tenantId: TENANT_ID,
            opspId: dhwaniOPSP.id,
            horizon: entry.horizon,
            rowIndex: entry.rowIndex,
            period: entry.period,
          },
        },
        update: {
          achievedValue: entry.achieved,
          comment: entry.comment,
        },
        create: {
          tenantId: TENANT_ID,
          opspId: dhwaniOPSP.id,
          userId: DHWANI_ID,
          horizon: entry.horizon,
          rowIndex: entry.rowIndex,
          category: entry.category,
          period: entry.period,
          targetValue: entry.target,
          achievedValue: entry.achieved,
          comment: entry.comment,
          updatedBy: DHWANI_ID,
        },
      });
    }

    console.log("✅ 9 OPSP review entries seeded");
  }

  /* ═══════════════════════════════════════════════
     12. GOALS (OKR hierarchy)
     ═══════════════════════════════════════════════ */
  const goalCompany = await prisma.goal.create({
    data: {
      tenantId: TENANT_ID,
      ownerId: ASHWIN_ID,
      title: "Reach ₹10 Cr ARR",
      description: "Company-wide annual revenue target",
      category: "revenue",
      targetValue: 100000000,
      currentValue: 32000000,
      unit: "INR",
      progressPercent: 32,
      quarter: QUARTER,
      year: YEAR,
      status: "active",
      createdBy: ASHWIN_ID,
    },
  });

  await prisma.goal.create({
    data: {
      tenantId: TENANT_ID,
      ownerId: meera.id,
      parentGoalId: goalCompany.id,
      title: "Close ₹4 Cr in enterprise deals",
      description: "Enterprise sales target for Q1",
      category: "revenue",
      targetValue: 40000000,
      currentValue: 18000000,
      unit: "INR",
      progressPercent: 45,
      quarter: QUARTER,
      year: YEAR,
      status: "active",
      createdBy: meera.id,
    },
  });

  await prisma.goal.create({
    data: {
      tenantId: TENANT_ID,
      ownerId: rahul.id,
      parentGoalId: goalCompany.id,
      title: "Ship V2 with zero P1 bugs",
      description: "Product quality gate for V2 release",
      category: "product",
      targetValue: 0,
      currentValue: 2,
      unit: "bugs",
      progressPercent: 60,
      quarter: QUARTER,
      year: YEAR,
      status: "at-risk",
      createdBy: rahul.id,
    },
  });

  await prisma.goal.create({
    data: {
      tenantId: TENANT_ID,
      ownerId: vikram.id,
      title: "Generate 500 MQLs from content",
      description: "Inbound marketing qualified leads",
      category: "marketing",
      targetValue: 500,
      currentValue: 180,
      unit: "leads",
      progressPercent: 36,
      quarter: QUARTER,
      year: YEAR,
      status: "active",
      createdBy: vikram.id,
    },
  });

  console.log("✅ 4 goals created (1 company + 3 individual)");

  /* ═══════════════════════════════════════════════
     13. AUDIT LOGS (sample entries)
     ═══════════════════════════════════════════════ */
  const auditEntries = [
    { actorId: ASHWIN_ID, action: "CREATE", entityType: "KPI", entityId: kpiRevenue.id, reason: "Created company revenue KPI" },
    { actorId: meera.id, action: "UPDATE", entityType: "KPI", entityId: kpiSalesTeam.id, reason: "Updated pipeline value" },
    { actorId: DHWANI_ID, action: "UPDATE", entityType: "OPSPData", entityId: dhwaniOPSP?.id ?? "unknown", reason: "OPSP autosave" },
    { actorId: DHWANI_ID, action: "UPDATE", entityType: "Review", entityId: dhwaniOPSP?.id ?? "unknown", reason: "OPSP Review: quarter Revenue row 0", changes: ["quarter:Revenue:m1"] },
  ];

  for (const a of auditEntries) {
    await prisma.auditLog.create({
      data: {
        tenantId: TENANT_ID,
        actorId: a.actorId,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        reason: a.reason,
        changes: a.changes ?? [],
      },
    });
  }

  console.log("✅ 4 audit log entries");

  /* ═══════════════════════════════════════════════
     Done
     ═══════════════════════════════════════════════ */
  console.log("\n🎉 Full seed complete!\n");
  console.log("Users (5 total):");
  console.log("  1. ashwin@moreyeahs.com (Ashwin Singone) — admin [existing]");
  console.log("  2. dhwani@moreyeahs.com (Dhwani Sharma)  — admin [existing]");
  console.log("  3. rahul@moreyeahs.com  (Rahul Patel)    — manager, Engineering — pw: Test@1234");
  console.log("  4. meera@moreyeahs.com  (Meera Gupta)    — team_head, Sales — pw: Test@1234");
  console.log("  5. vikram@moreyeahs.com (Vikram Singh)   — employee, Marketing — pw: Test@1234");
  console.log("\nTeams: Engineering, Sales, Marketing, Operations");
  console.log("KPIs: 7 (company→team→individual hierarchy with 13-week values)");
  console.log("Priorities: 5 with weekly statuses");
  console.log("WWW Items: 8");
  console.log("Meetings: 5 with attendees + 3 templates");
  console.log("Huddles: 5 days");
  console.log("OPSP: 2 (Ashwin finalized + Dhwani draft with full data)");
  console.log("OPSP Review: 9 entries across all 3 horizons");
  console.log("Goals: 4 (OKR hierarchy)");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
