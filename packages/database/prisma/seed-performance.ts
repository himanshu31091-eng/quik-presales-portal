/**
 * Performance Module Dummy Data Seed
 * Run with: tsx prisma/seed-performance.ts
 *
 * Creates:
 *  - 5 new users (total 9 people across 6 teams)
 *  - KPIs for each person (varying progress)
 *  - Priorities for each person (varying completion)
 *  - 10 historical weekly meetings with attendance
 *  - Talent assessments (covers all 9 boxes of the grid)
 *  - 3 performance reviews
 *
 * Designed so each person lands in a DIFFERENT 9-box cell:
 *   Star | High Performer | Specialist
 *   High Potential | Core Player | Average Player
 *   Enigma | Inconsistent | Underperformer
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// ─── Existing IDs ────────────────────────────────────────────────────────────
const TENANT = "cmniw5uyu000042zwp613fjug";

const EXISTING = {
  ashwin:   "cmniw5v0l000142zwvwozcvpq", // admin  / Leadership
  dhwani:   "cmniw5v0o000242zwnjercy0p", // manager / Engineering
  akhilesh: "cmniw5v0o000342zwtz2kqr1l", // employee / Engineering
  sarim:    "cmnobj61i000011ps624xyfk2", // manager / no team
};

const TEAMS = {
  engineering:  "cmniw5v0p000542zwyancovaz",
  qa:           "cmnnkq1nn0023mkrj04jmthbc",
  sales:        "cmniw5v0s000742zwvhq15j56",
  account:      "cmnnkyw240027mkrjlimvz49z",
  hr:           "cmnnkz3t20029mkrjpyqizhty",
  it:           "cmnnkze2f002bmkrjm3uadbi8",
  marketing:    "cmnnkzrvr002fmkrjlfhx5be0",
  operations:   "cmnnkzzkj002hmkrj96ylmml4",
  leadership:   "cmnnkzm5s002dmkrjlcg6llqe",
};

const YEAR = 2026;
const QUARTER = "Q1";

// ─── Performance scoring guide ────────────────────────────────────────────────
// score = kpi*0.5 + priority*0.3 + attendance*0.2
// high   >= 70  (kpi≈85-95%, priority≈75-90%, attendance≈85-100%)
// medium 40-69  (kpi≈50-65%, priority≈40-60%, attendance≈55-70%)
// low    < 40   (kpi≈15-30%, priority≈15-30%, attendance≈30-45%)

type PersonProfile = {
  userId: string;
  teamId: string | null;
  role: string;
  kpiTargets: Array<{ name: string; progress: number; target: number; achieved: number; unit: string }>;
  priorityStatuses: Array<"completed" | "on-track" | "behind" | "not-started">;
  attendanceOutOf10: number;       // how many of 10 meetings attended
  potential: "low" | "medium" | "high";
  flightRisk: "low" | "medium" | "high";
  successionReady: "not-ready" | "developing" | "ready-now";
  skills: string[];
  developmentNotes: string;
  expectedBox: string;
};

async function main() {
  console.log("🌱 Seeding performance dummy data...\n");

  const hashedPw = await bcrypt.hash("password123", 10);

  // ── 1. Create 5 new users ──────────────────────────────────────────────────
  console.log("👤 Creating new users...");

  const newUsers = await Promise.all([
    db.user.upsert({
      where: { email: "sarah.chen@moreyeahs.com" },
      update: {},
      create: { email: "sarah.chen@moreyeahs.com",   firstName: "Sarah",    lastName: "Chen",       password: hashedPw },
    }),
    db.user.upsert({
      where: { email: "marcus.johnson@moreyeahs.com" },
      update: {},
      create: { email: "marcus.johnson@moreyeahs.com", firstName: "Marcus", lastName: "Johnson",    password: hashedPw },
    }),
    db.user.upsert({
      where: { email: "priya.patel@moreyeahs.com" },
      update: {},
      create: { email: "priya.patel@moreyeahs.com",  firstName: "Priya",    lastName: "Patel",      password: hashedPw },
    }),
    db.user.upsert({
      where: { email: "tom.williams@moreyeahs.com" },
      update: {},
      create: { email: "tom.williams@moreyeahs.com", firstName: "Tom",      lastName: "Williams",   password: hashedPw },
    }),
    db.user.upsert({
      where: { email: "lisa.rodriguez@moreyeahs.com" },
      update: {},
      create: { email: "lisa.rodriguez@moreyeahs.com", firstName: "Lisa",  lastName: "Rodriguez",  password: hashedPw },
    }),
  ]);

  const [sarah, marcus, priya, tom, lisa] = newUsers;
  console.log(`  ✅ Created/found: ${newUsers.map(u => u.firstName).join(", ")}`);

  // ── 2. Create memberships for new users ────────────────────────────────────
  console.log("\n🔗 Creating memberships...");
  const membershipData = [
    { userId: sarah.id,  teamId: TEAMS.sales,      role: "manager"  },
    { userId: marcus.id, teamId: TEAMS.qa,          role: "employee" },
    { userId: priya.id,  teamId: TEAMS.hr,          role: "manager"  },
    { userId: tom.id,    teamId: TEAMS.marketing,   role: "employee" },
    { userId: lisa.id,   teamId: TEAMS.operations,  role: "employee" },
  ];

  for (const m of membershipData) {
    await db.orgMember.upsert({
      where: { tenantId_userId: { tenantId: TENANT, userId: m.userId } },
      update: {},
      create: { tenantId: TENANT, ...m, status: "active" },
    });
  }

  // Fix Sarim's membership to assign to sales team
  await db.orgMember.update({
    where: { tenantId_userId: { tenantId: TENANT, userId: EXISTING.sarim } },
    data: { teamId: TEAMS.sales },
  });

  console.log("  ✅ All memberships ready");

  // ── 3. Define full profiles for all 9 people ───────────────────────────────
  const profiles: Record<string, PersonProfile> = {
    // ─ HIGH PERF / HIGH POTENTIAL → Star ⭐ (purple)
    ashwin: {
      userId: EXISTING.ashwin,
      teamId: TEAMS.leadership,
      role: "admin",
      kpiTargets: [
        { name: "Revenue Growth",        progress: 92, target: 500000, achieved: 460000, unit: "Currency" },
        { name: "Team Engagement Score", progress: 88, target: 100,    achieved: 88,     unit: "Percentage" },
        { name: "Strategic Initiatives", progress: 95, target: 10,     achieved: 9.5,    unit: "Number" },
      ],
      priorityStatuses: ["completed","completed","completed","on-track"],
      attendanceOutOf10: 10,
      potential: "high",
      flightRisk: "low",
      successionReady: "ready-now",
      skills: ["Strategic Planning","Leadership","Data-Driven","Executive Communication","Cross-functional"],
      developmentNotes: "High-impact leader. Ready for expanded scope. Recommend for board-level exposure.",
      expectedBox: "Star",
    },

    // ─ HIGH PERF / MEDIUM POTENTIAL → High Performer 🟢
    dhwani: {
      userId: EXISTING.dhwani,
      teamId: TEAMS.engineering,
      role: "manager",
      kpiTargets: [
        { name: "Sprint Velocity",    progress: 87, target: 120, achieved: 104, unit: "Number" },
        { name: "Code Coverage",      progress: 82, target: 90,  achieved: 74,  unit: "Percentage" },
      ],
      priorityStatuses: ["completed","completed","on-track","on-track"],
      attendanceOutOf10: 9,
      potential: "medium",
      flightRisk: "low",
      successionReady: "developing",
      skills: ["Engineering Management","Agile","React","TypeScript","System Design"],
      developmentNotes: "Consistent delivery. Strong technical skills. Should develop strategic thinking and people leadership.",
      expectedBox: "High Performer",
    },

    // ─ HIGH PERF / LOW POTENTIAL → Specialist 🟦
    sarim: {
      userId: EXISTING.sarim,
      teamId: TEAMS.sales,
      role: "manager",
      kpiTargets: [
        { name: "Sales Revenue",  progress: 84, target: 2000000, achieved: 1680000, unit: "Currency" },
        { name: "New Deals",      progress: 78, target: 50,      achieved: 39,      unit: "Number" },
      ],
      priorityStatuses: ["completed","on-track","on-track"],
      attendanceOutOf10: 8,
      potential: "low",
      flightRisk: "medium",
      successionReady: "not-ready",
      skills: ["B2B Sales","Negotiation","CRM","Pipeline Management"],
      developmentNotes: "Top individual contributor. Deep domain expertise. Limited appetite for broader leadership responsibility.",
      expectedBox: "Specialist",
    },

    // ─ MEDIUM PERF / HIGH POTENTIAL → High Potential 🔵
    akhilesh: {
      userId: EXISTING.akhilesh,
      teamId: TEAMS.engineering,
      role: "employee",
      kpiTargets: [
        { name: "Feature Delivery",   progress: 62, target: 20, achieved: 12, unit: "Number" },
        { name: "Bug Resolution Time",progress: 58, target: 48, achieved: 28, unit: "Number" },
      ],
      priorityStatuses: ["on-track","on-track","not-started","not-started"],
      attendanceOutOf10: 7,
      potential: "high",
      flightRisk: "low",
      successionReady: "developing",
      skills: ["Full-Stack Dev","Problem Solving","Fast Learner","Node.js","Prisma"],
      developmentNotes: "Technically brilliant. Currently in ramp-up phase. High-ceiling talent — fast-track for tech lead role.",
      expectedBox: "High Potential",
    },

    // ─ MEDIUM PERF / MEDIUM POTENTIAL → Core Player ☁️
    sarah: {
      userId: sarah.id,
      teamId: TEAMS.sales,
      role: "manager",
      kpiTargets: [
        { name: "Quota Attainment",     progress: 55, target: 1500000, achieved: 825000, unit: "Currency" },
        { name: "Client Retention",     progress: 60, target: 95,      achieved: 57,     unit: "Percentage" },
      ],
      priorityStatuses: ["on-track","on-track","behind","not-started"],
      attendanceOutOf10: 6,
      potential: "medium",
      flightRisk: "low",
      successionReady: "not-ready",
      skills: ["Account Management","Presentation","Relationship Building"],
      developmentNotes: "Steady performer. Meets most targets. Should focus on closing speed and strategic account planning.",
      expectedBox: "Core Player",
    },

    // ─ MEDIUM PERF / LOW POTENTIAL → Average Player 🩶
    marcus: {
      userId: marcus.id,
      teamId: TEAMS.qa,
      role: "employee",
      kpiTargets: [
        { name: "Test Coverage",        progress: 50, target: 80, achieved: 40, unit: "Percentage" },
        { name: "Defect Detection Rate",progress: 45, target: 90, achieved: 40, unit: "Percentage" },
      ],
      priorityStatuses: ["on-track","behind","not-started"],
      attendanceOutOf10: 6,
      potential: "low",
      flightRisk: "low",
      successionReady: "not-ready",
      skills: ["Manual Testing","JIRA","Test Case Writing"],
      developmentNotes: "Adequate output. Not showing growth trajectory. Consider role-fit discussion.",
      expectedBox: "Average Player",
    },

    // ─ LOW PERF / HIGH POTENTIAL → Enigma 🟡
    priya: {
      userId: priya.id,
      teamId: TEAMS.hr,
      role: "manager",
      kpiTargets: [
        { name: "Hiring Fulfilment Rate", progress: 28, target: 100, achieved: 28, unit: "Percentage" },
        { name: "Employee NPS",           progress: 32, target: 70,  achieved: 22, unit: "Number" },
      ],
      priorityStatuses: ["behind","not-started","not-started"],
      attendanceOutOf10: 4,
      potential: "high",
      flightRisk: "medium",
      successionReady: "not-ready",
      skills: ["Talent Acquisition","Culture Building","HRBP","Coaching","OD"],
      developmentNotes: "Highly capable but currently disengaged. Investigate root cause — personal challenges or misaligned role. Worth investing in.",
      expectedBox: "Enigma",
    },

    // ─ LOW PERF / MEDIUM POTENTIAL → Inconsistent 🟠
    tom: {
      userId: tom.id,
      teamId: TEAMS.marketing,
      role: "employee",
      kpiTargets: [
        { name: "Lead Generation",     progress: 22, target: 500, achieved: 110, unit: "Number" },
        { name: "Campaign ROI",        progress: 30, target: 300, achieved: 90,  unit: "Percentage" },
      ],
      priorityStatuses: ["behind","not-started","not-started"],
      attendanceOutOf10: 4,
      potential: "medium",
      flightRisk: "high",
      successionReady: "not-ready",
      skills: ["Digital Marketing","Content Creation","Social Media"],
      developmentNotes: "Shows flashes of creativity but lacks consistency. Needs structured coaching on execution and prioritisation.",
      expectedBox: "Inconsistent",
    },

    // ─ LOW PERF / LOW POTENTIAL → Underperformer 🔴
    lisa: {
      userId: lisa.id,
      teamId: TEAMS.operations,
      role: "employee",
      kpiTargets: [
        { name: "Process Efficiency",  progress: 14, target: 85, achieved: 12, unit: "Percentage" },
        { name: "SLA Adherence",       progress: 20, target: 95, achieved: 19, unit: "Percentage" },
      ],
      priorityStatuses: ["not-started","not-started","not-started"],
      attendanceOutOf10: 3,
      potential: "low",
      flightRisk: "high",
      successionReady: "not-ready",
      skills: ["Data Entry","Reporting"],
      developmentNotes: "Significant performance gaps. Active PIP needed. Limited growth signals observed.",
      expectedBox: "Underperformer",
    },
  };

  // ── 4. Create KPIs ──────────────────────────────────────────────────────────
  console.log("\n📊 Creating KPIs...");
  let kpiCount = 0;

  for (const [key, profile] of Object.entries(profiles)) {
    for (const kpi of profile.kpiTargets) {
      // Check if a similar KPI already exists for this user in Q1 2026
      const existing = await db.kPI.findFirst({
        where: { tenantId: TENANT, owner: profile.userId, name: kpi.name, quarter: QUARTER, year: YEAR },
      });
      if (existing) continue;

      await db.kPI.create({
        data: {
          tenantId: TENANT,
          name: kpi.name,
          owner: profile.userId,
          teamId: profile.teamId,
          quarter: QUARTER,
          year: YEAR,
          measurementUnit: kpi.unit,
          target: kpi.target,
          quarterlyGoal: kpi.target,
          qtdGoal: kpi.target,
          qtdAchieved: kpi.achieved,
          progressPercent: kpi.progress,
          status: "active",
          healthStatus: kpi.progress >= 80 ? "on-track" : kpi.progress >= 50 ? "needs-attention" : "behind-schedule",
          divisionType: "Cumulative",
          createdBy: EXISTING.ashwin,
        },
      });
      kpiCount++;
    }
  }
  console.log(`  ✅ Created ${kpiCount} KPIs`);

  // ── 5. Create Priorities ────────────────────────────────────────────────────
  console.log("\n🎯 Creating priorities...");

  const priorityNames: Record<string, string[]> = {
    ashwin:   ["Launch Q1 Strategic Plan","Board Report Preparation","Talent Review Completion","Leadership Offsite"],
    dhwani:   ["Migrate to TypeScript 5","Implement CI/CD pipeline","Team Code Review Process","API Documentation"],
    sarim:    ["Close Enterprise Deal — Nexus Corp","Q1 Pipeline Review","CRM Data Cleanup"],
    akhilesh: ["Build KPI Dashboard v2","Refactor Auth Module","Unit Test Coverage","Technical Debt Sprint"],
    sarah:    ["Renew 3 Key Accounts","Launch Sales Playbook","Q1 Forecast Review","Client Satisfaction Survey"],
    marcus:   ["Automate Regression Suite","Update Test Cases","UAT Coordination"],
    priya:    ["Complete 5 Open Hires","Onboarding Process Redesign","Culture Survey Launch"],
    tom:      ["Q1 Campaign Launch","Website Revamp","Social Media Calendar","Lead Nurture Workflow"],
    lisa:     ["Process Mapping Exercise","SLA Documentation","Reporting Dashboard"],
  };

  let priorityCount = 0;
  for (const [key, profile] of Object.entries(profiles)) {
    const names = priorityNames[key] || [];
    for (let i = 0; i < names.length; i++) {
      const status = profile.priorityStatuses[i] ?? "not-started";
      const exists = await db.priority.findFirst({
        where: { tenantId: TENANT, owner: profile.userId, name: names[i], quarter: QUARTER, year: YEAR },
      });
      if (exists) continue;

      await db.priority.create({
        data: {
          tenantId: TENANT,
          name: names[i],
          owner: profile.userId,
          teamId: profile.teamId,
          quarter: QUARTER,
          year: YEAR,
          startWeek: 1,
          endWeek: 13,
          overallStatus: status,
          createdBy: EXISTING.ashwin,
        },
      });
      priorityCount++;
    }
  }
  console.log(`  ✅ Created ${priorityCount} priorities`);

  // ── 6. Create 10 weekly meetings + attendance ───────────────────────────────
  console.log("\n📅 Creating meetings + attendance...");

  const allUserIds = Object.values(profiles).map(p => p.userId);
  const meetingCreated: string[] = [];

  for (let week = 1; week <= 10; week++) {
    const daysAgo = (10 - week) * 7;
    const meetingDate = new Date();
    meetingDate.setDate(meetingDate.getDate() - daysAgo);

    const meeting = await db.meeting.create({
      data: {
        tenantId: TENANT,
        name: `Weekly Leadership Sync — Week ${week}`,
        cadence: "weekly",
        scheduledAt: meetingDate,
        duration: 60,
        startedOnTime: true,
        endedOnTime: true,
        formatFollowed: true,
        createdBy: EXISTING.ashwin,
      },
    });
    meetingCreated.push(meeting.id);

    // Create attendee records for all users
    for (const [key, profile] of Object.entries(profiles)) {
      // Determine attendance: attend first N of 10 meetings
      const attended = week <= profile.attendanceOutOf10;
      await db.meetingAttendee.upsert({
        where: { meetingId_userId: { meetingId: meeting.id, userId: profile.userId } },
        update: {},
        create: {
          meetingId: meeting.id,
          userId: profile.userId,
          attended,
          attendedAt: attended ? meetingDate : null,
        },
      });
    }
  }
  console.log(`  ✅ Created ${meetingCreated.length} meetings with attendance`);

  // ── 7. Create Talent Assessments ────────────────────────────────────────────
  console.log("\n🎭 Creating talent assessments...");

  let talentCount = 0;
  for (const [key, profile] of Object.entries(profiles)) {
    await db.talentAssessment.upsert({
      where: {
        tenantId_userId_quarter_year: {
          tenantId: TENANT,
          userId: profile.userId,
          quarter: QUARTER,
          year: YEAR,
        },
      },
      update: {
        potential: profile.potential,
        flightRisk: profile.flightRisk,
        successionReady: profile.successionReady,
        skills: profile.skills,
        developmentNotes: profile.developmentNotes,
        assessorId: EXISTING.ashwin,
      },
      create: {
        tenantId: TENANT,
        userId: profile.userId,
        assessorId: EXISTING.ashwin,
        potential: profile.potential,
        flightRisk: profile.flightRisk,
        successionReady: profile.successionReady,
        skills: profile.skills,
        developmentNotes: profile.developmentNotes,
        quarter: QUARTER,
        year: YEAR,
      },
    });
    talentCount++;
  }
  console.log(`  ✅ Created ${talentCount} talent assessments`);

  // ── 8. Create Performance Reviews ──────────────────────────────────────────
  console.log("\n📝 Creating performance reviews...");

  const reviewsData = [
    {
      reviewerId: EXISTING.ashwin,
      revieweeId: EXISTING.dhwani,
      kpiScore: 84,   priorityScore: 75, attendanceScore: 90, overallScore: 82,
      rating: 4,
      strengths: "Exceptional engineering discipline. Dhwani consistently delivers quality code on time and mentors junior members effectively.",
      improvements: "Should work on cross-team communication and product ownership mindset.",
      notes: "Ready for principal engineer track discussions in Q2.",
      status: "submitted",
    },
    {
      reviewerId: EXISTING.ashwin,
      revieweeId: EXISTING.akhilesh,
      kpiScore: 60,   priorityScore: 50, attendanceScore: 70, overallScore: 58,
      rating: 3,
      strengths: "Demonstrated exceptional problem-solving ability. Learning curve is steep but trajectory is impressive.",
      improvements: "Needs to improve on time management and proactive communication of blockers.",
      notes: "High potential. Give stretch assignments in Q2 to accelerate growth.",
      status: "submitted",
    },
    {
      reviewerId: EXISTING.ashwin,
      revieweeId: EXISTING.sarim,
      kpiScore: 81,   priorityScore: 78, attendanceScore: 80, overallScore: 80,
      rating: 4,
      strengths: "Sarim is a deal-closing machine. Best individual sales performer in the org.",
      improvements: "Could develop team-building skills to scale beyond individual contributor.",
      notes: "Consider retention bonus — market risk. Flight risk if not recognised.",
      status: "draft",
    },
  ];

  let reviewCount = 0;
  for (const r of reviewsData) {
    const exists = await db.performanceReview.findFirst({
      where: { tenantId: TENANT, reviewerId: r.reviewerId, revieweeId: r.revieweeId, quarter: QUARTER, year: YEAR },
    });
    if (exists) continue;

    await db.performanceReview.create({
      data: {
        tenantId: TENANT,
        quarter: QUARTER,
        year: YEAR,
        ...r,
      },
    });
    reviewCount++;
  }
  console.log(`  ✅ Created ${reviewCount} performance reviews`);

  // ── 9. Summary ──────────────────────────────────────────────────────────────
  console.log("\n🎉 Performance seed complete!\n");
  console.log("9-Box Grid — Expected layout:");
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│  POTENTIAL →     Low         Medium          High               │");
  console.log("│  PERF ↓                                                         │");
  console.log("│  High       Specialist(Sarim) High Perf(Dhwani)  Star(Ashwin)   │");
  console.log("│  Medium     Avg Player(Marcus) Core(Sarah)  Hi-Pot(Akhilesh)    │");
  console.log("│  Low        Underperformer(Lisa) Inconsist(Tom)  Enigma(Priya)  │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("\nNew user logins (all password: password123):");
  console.log("  sarah.chen@moreyeahs.com");
  console.log("  marcus.johnson@moreyeahs.com");
  console.log("  priya.patel@moreyeahs.com");
  console.log("  tom.williams@moreyeahs.com");
  console.log("  lisa.rodriguez@moreyeahs.com");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
