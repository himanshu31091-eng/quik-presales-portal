/**
 * Moreyeahs tenant — combined demo seeder for QuikScale + QuikTrack + QuikSocial.
 *
 * Adds three new users to the existing Moreyeahs org:
 *   - dhwani@moreyeahs.com  →  org_admin
 *   - pravin@moreyeahs.com  →  member
 *   - rishab@moreyeahs.com  →  member
 *
 * Ashwin (existing super_admin) is preserved as-is.
 *
 * Grants UserAppAccess for QuikScale, QuikTrack, QuikSocial and QuikInfra
 * to all four members so any one user can pop between every product app.
 *
 * Seeds rich domain data scoped to Moreyeahs orgId for the three shared-schema
 * apps. QuikInfra has its own schema (separate Prisma client + JIT-
 * provisioned CnUser rows) — the demo data there lives under tenantId="default"
 * which is what every JIT-mirrored user lands in. Run the per-app
 * apps/quikinfra/scripts/seed-dummy.ts to populate that side.
 *
 * Idempotent: wipes only Moreyeahs-scoped demo data + the three new users'
 * memberships, then re-seeds. Other orgs and ashwin's data are untouched.
 *
 * Run from the repo root:
 *   DATABASE_URL='postgresql://postgres:sa%40123@localhost:5432/quikit_dev' \
 *     npx tsx packages/database/prisma/seed-moreyeahs.ts
 *
 * or via npm:
 *   npm run db:seed:moreyeahs --workspace=@quikit/database
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { scryptSync, randomBytes } from "node:crypto";
// QuikInfra has its own Prisma client + schema (snake_case tables under
// app_quikinfra). It's generated to a custom path so root postinstall
// doesn't clobber it. Construction data lives outside the shared schema.
import { PrismaClient as QcPrismaClient, Prisma as QcPrisma } from "../../../apps/quikinfra/node_modules/.prisma-qc/client";

const db = new PrismaClient();
const qc = new QcPrismaClient();

function scryptHash(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const ORG_SLUG = "moreyeahs";
const PASSWORD = "Test@123";

const PRODUCT_APP_SLUGS = ["quikscale", "quiktrack", "quiksocial", "quikinfra"];

const ASHWIN_EMAIL = "ashwin@moreyeahs.com";

const NEW_USERS = [
  { email: "dhwani@moreyeahs.com", firstName: "Dhwani", lastName: "Patel", role: "org_admin" },
  { email: "pravin@moreyeahs.com", firstName: "Pravin", lastName: "Sharma", role: "member" },
  { email: "rishab@moreyeahs.com", firstName: "Rishab", lastName: "Khan", role: "member" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── 1. USERS + MEMBERSHIPS + APP ACCESS ─────────────────────────────────────

async function ensureUsersAndAccess(orgId: string) {
  console.log("\n👥 Provisioning users + memberships + app access…");
  const hashed = await bcrypt.hash(PASSWORD, 10);

  // 1a. Find ashwin (must exist)
  const ashwin = await db.user.findUnique({ where: { email: ASHWIN_EMAIL } });
  if (!ashwin) throw new Error(`Existing user ${ASHWIN_EMAIL} not found — aborting`);

  // 1b. Upsert the three new users
  const userIds: Record<string, string> = { [ASHWIN_EMAIL]: ashwin.id };
  for (const u of NEW_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        password: hashed,
        emailVerified: new Date(),
      },
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        password: hashed,
        emailVerified: new Date(),
        themeMode: "light",
        accentColor: "#0066cc",
      },
    });
    userIds[u.email] = user.id;
    console.log(`  ✓ user: ${u.email} (${u.role})`);
  }

  // 1c. Memberships
  for (const u of NEW_USERS) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: userIds[u.email]! } },
      update: { role: u.role, status: "active" },
      create: {
        orgId,
        userId: userIds[u.email]!,
        role: u.role,
        status: "active",
        acceptedAt: new Date(),
      },
    });
  }

  // 1d. UserAppAccess for the 4 product apps — for ashwin AND the 3 new users.
  const apps = await db.app.findMany({ where: { slug: { in: PRODUCT_APP_SLUGS } } });
  const allEmails = [ASHWIN_EMAIL, ...NEW_USERS.map((u) => u.email)];
  for (const email of allEmails) {
    for (const app of apps) {
      const isAdmin = email === ASHWIN_EMAIL || email === "dhwani@moreyeahs.com";
      await db.userAppAccess.upsert({
        where: { userId_orgId_appId: { userId: userIds[email]!, orgId, appId: app.id } },
        update: { role: isAdmin ? "admin" : "member" },
        create: {
          userId: userIds[email]!,
          orgId,
          appId: app.id,
          role: isAdmin ? "admin" : "member",
        },
      });
    }
  }
  console.log(`  ✓ granted ${apps.length} app(s) to ${allEmails.length} user(s)`);

  return userIds;
}

// ── 2. QUIKSCALE ────────────────────────────────────────────────────────────

const QS_TEAMS = [
  { slug: "engineering", name: "Engineering", color: "#3b82f6" },
  { slug: "sales", name: "Sales", color: "#10b981" },
  { slug: "operations", name: "Operations", color: "#f59e0b" },
];

const QS_CATEGORIES = [
  { name: "Revenue", dataType: "Currency", currency: "INR" },
  { name: "Operations", dataType: "Number", currency: null },
  { name: "People", dataType: "Number", currency: null },
  { name: "Customer", dataType: "Percentage", currency: null },
];

const QS_INDIVIDUAL_KPIS = [
  { name: "Monthly Revenue", unit: "Currency", target: 1500000, scale: "L" },
  { name: "Tickets Resolved", unit: "Number", target: 50, scale: null },
  { name: "Customer NPS", unit: "Percentage", target: 80, scale: null },
  { name: "PR Reviews Completed", unit: "Number", target: 40, scale: null },
  { name: "Sales Calls Made", unit: "Number", target: 60, scale: null },
  { name: "Demo Conversions", unit: "Percentage", target: 35, scale: null },
  { name: "Bug Fixes Shipped", unit: "Number", target: 25, scale: null },
  { name: "Marketing Qualified Leads", unit: "Number", target: 200, scale: null },
];

const QS_TEAM_KPIS: Array<{ name: string; unit: string; target: number; scale: string | null; team: string | "all" }> = [
  { name: "Quarterly Revenue", unit: "Currency", target: 12000000, scale: "L", team: "sales" },
  { name: "Team Velocity (Story Points)", unit: "Number", target: 600, scale: null, team: "engineering" },
  { name: "Customer Retention Rate", unit: "Percentage", target: 95, scale: null, team: "operations" },
  // Cross-team — every Moreyeahs member is an owner so it shows up for everyone.
  { name: "Company-wide NPS", unit: "Percentage", target: 75, scale: null, team: "all" },
];

const QS_PRIORITY_TEMPLATES = [
  "Launch v2 of customer portal",
  "Migrate legacy CRM to new stack",
  "Hire 2 senior engineers",
  "Run Q1 OKR planning workshop",
  "Close 5 enterprise deals",
];

const QS_WWW_TEMPLATES = [
  "Closed first enterprise deal",
  "Shipped dark mode support",
  "Reduced bug backlog by 40%",
  "Onboarded new team member",
  "Hit weekly KPI target",
  "Resolved long-standing tech debt",
];

async function wipeQuikscale(orgId: string) {
  await db.$transaction([
    db.kPIWeeklyValue.deleteMany({ where: { orgId } }),
    db.kPINote.deleteMany({ where: { orgId } }),
    db.kPILog.deleteMany({ where: { orgId } }),
    db.kPI.deleteMany({ where: { orgId } }),
    db.priorityWeeklyStatus.deleteMany({ where: { priority: { orgId } } }),
    db.priority.deleteMany({ where: { orgId } }),
    db.wWWRevisionLog.deleteMany({ where: { wwwItem: { orgId } } }),
    db.wWWItem.deleteMany({ where: { orgId } }),
    db.accountabilityFunction.deleteMany({ where: { orgId } }),
    db.categoryMaster.deleteMany({ where: { orgId } }),
    db.quarterSetting.deleteMany({ where: { orgId } }),
    db.userTeam.deleteMany({ where: { orgId } }),
    db.team.deleteMany({ where: { orgId } }),
  ]);
}

// Compute April-based fiscal year + quarter to match QuikScale's UI
// (apps/quikscale/lib/utils/fiscal.ts hardcodes Apr–Mar fiscal periods).
function getFiscalYearApril(now: Date = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
function getFiscalQuarterApril(now: Date = new Date()): "Q1" | "Q2" | "Q3" | "Q4" {
  const m = now.getMonth();
  if (m >= 3 && m <= 5) return "Q1";
  if (m >= 6 && m <= 8) return "Q2";
  if (m >= 9 && m <= 11) return "Q3";
  return "Q4";
}

async function seedQuikscale(orgId: string, userIds: Record<string, string>) {
  console.log("\n📊 Seeding QuikScale (KPIs / Priorities / WWW)…");
  await wipeQuikscale(orgId);

  // Align Moreyeahs org to April fiscal year so QuarterSetting + UI agree.
  await db.org.update({
    where: { id: orgId },
    data: { fiscalYearStart: 4, quarterStartMonth: 4 },
  });

  const adminId = userIds[ASHWIN_EMAIL]!;
  const dhwaniId = userIds["dhwani@moreyeahs.com"]!;
  const pravinId = userIds["pravin@moreyeahs.com"]!;
  const rishabId = userIds["rishab@moreyeahs.com"]!;

  const memberAssignments: Array<{ id: string; firstName: string; team: string }> = [
    { id: adminId, firstName: "Ashwin", team: "engineering" },
    { id: dhwaniId, firstName: "Dhwani", team: "operations" },
    { id: pravinId, firstName: "Pravin", team: "engineering" },
    { id: rishabId, firstName: "Rishab", team: "sales" },
  ];

  // Teams
  const teamIds: Record<string, string> = {};
  for (const t of QS_TEAMS) {
    const head = memberAssignments.find((m) => m.team === t.slug);
    const team = await db.team.create({
      data: {
        orgId,
        name: t.name,
        slug: t.slug,
        color: t.color,
        headId: head?.id,
        createdBy: adminId,
      },
    });
    teamIds[t.slug] = team.id;
  }
  for (const m of memberAssignments) {
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: m.id } },
      data: { teamId: teamIds[m.team] },
    });
    await db.userTeam.create({
      data: { orgId, userId: m.id, teamId: teamIds[m.team]! },
    });
  }
  console.log(`  ✓ teams: ${QS_TEAMS.length}`);

  // Quarters — April-based fiscal year so QuarterSetting matches the UI's
  // hardcoded fiscal calendar (Q1=Apr–Jun, Q2=Jul–Sep, Q3=Oct–Dec, Q4=Jan–Mar).
  const fy = getFiscalYearApril();
  const quarters = [
    { quarter: "Q1", startDate: new Date(`${fy}-04-01`), endDate: new Date(`${fy}-06-30`) },
    { quarter: "Q2", startDate: new Date(`${fy}-07-01`), endDate: new Date(`${fy}-09-30`) },
    { quarter: "Q3", startDate: new Date(`${fy}-10-01`), endDate: new Date(`${fy}-12-31`) },
    { quarter: "Q4", startDate: new Date(`${fy + 1}-01-01`), endDate: new Date(`${fy + 1}-03-31`) },
  ];
  const now = new Date();
  for (const q of quarters) {
    const status = q.endDate < now ? "completed" : q.startDate > now ? "upcoming" : "active";
    await db.quarterSetting.create({
      data: { orgId, fiscalYear: fy, quarter: q.quarter, startDate: q.startDate, endDate: q.endDate, status, createdBy: adminId },
    });
  }
  const activeFiscalQuarter = getFiscalQuarterApril();
  // Use the active fiscal quarter for KPI/Priority labels — matches what the
  // UI's getFiscalYear()/getFiscalQuarter() return on first page load.
  const year = fy;
  const activeQuarter = quarters.find((q) => q.quarter === activeFiscalQuarter)!;
  console.log(`  ✓ quarters: 4 (FY${fy}) — active=${activeFiscalQuarter}`);

  // Categories
  for (const c of QS_CATEGORIES) {
    await db.categoryMaster.create({
      data: {
        orgId,
        name: c.name,
        nameKey: c.name.toLowerCase().trim(),
        dataType: c.dataType,
        currency: c.currency,
        createdBy: adminId,
      },
    });
  }
  console.log(`  ✓ categories: ${QS_CATEGORIES.length}`);

  // Accountability functions
  const eng = await db.accountabilityFunction.create({
    data: {
      orgId,
      name: "Engineering Excellence",
      description: "Ship reliable software",
      teamId: teamIds.engineering,
      assignedToUserId: adminId,
    },
  });
  await db.accountabilityFunction.createMany({
    data: [
      { orgId, name: "Code Review Ownership", teamId: teamIds.engineering, parentFunctionId: eng.id, assignedToUserId: pravinId },
      { orgId, name: "Sales Pipeline Growth", teamId: teamIds.sales, assignedToUserId: rishabId },
      { orgId, name: "Operations & Support", teamId: teamIds.operations, assignedToUserId: dhwaniId },
    ],
  });
  console.log("  ✓ accountability functions: 4");

  // Individual KPIs — deterministic minimum of 3 per member so every user
  // sees at least 3 rows on their "My KPIs" view.
  let kpiCount = 0;
  for (const m of memberAssignments) {
    const picks = pickN(QS_INDIVIDUAL_KPIS, 3);
    for (const tmpl of picks) {
      const target = tmpl.target;
      const weeklyTargets: Record<string, number> = {};
      for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = target / 13;
      const kpi = await db.kPI.create({
        data: {
          orgId,
          name: `${tmpl.name} (${m.firstName})`,
          description: `Demo KPI for ${m.firstName}`,
          kpiLevel: "individual",
          owner: m.id,
          quarter: activeQuarter.quarter,
          year,
          measurementUnit: tmpl.unit,
          target,
          quarterlyGoal: target,
          qtdGoal: target,
          divisionType: "Cumulative",
          weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
          targetScale: tmpl.scale,
          frequency: "weekly",
          status: "active",
          healthStatus: rand(["on-track", "on-track", "at-risk"]),
          teamId: teamIds[m.team],
          createdBy: m.id,
        },
      });
      const weeksWith = randInt(4, 9);
      let qtd = 0;
      for (let w = 1; w <= weeksWith; w++) {
        const expected = target / 13;
        const actual = expected * (0.6 + Math.random() * 0.6);
        await db.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: m.id,
            weekNumber: w,
            value: Math.round(actual * 100) / 100,
            createdBy: m.id,
          },
        });
        qtd += actual;
      }
      await db.kPI.update({ where: { id: kpi.id }, data: { qtdAchieved: Math.round(qtd * 100) / 100 } });
      kpiCount++;
    }
  }

  // Team KPIs — "all" = every Moreyeahs member is an owner.
  for (const t of QS_TEAM_KPIS) {
    const ownerIds =
      t.team === "all"
        ? memberAssignments.map((m) => m.id)
        : memberAssignments.filter((m) => m.team === t.team).map((m) => m.id);
    if (ownerIds.length === 0) continue;
    const teamRefId = t.team === "all" ? teamIds.engineering : teamIds[t.team];
    const contribPerOwner = 100 / ownerIds.length;
    const ownerContributions: Record<string, number> = {};
    ownerIds.forEach((id) => (ownerContributions[id] = contribPerOwner));
    const weeklyTargets: Record<string, number> = {};
    for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = t.target / 13;
    const kpi = await db.kPI.create({
      data: {
        orgId,
        name: t.name,
        description: `Team-wide ${t.name}`,
        kpiLevel: "team",
        owner: ownerIds[0]!,
        ownerIds,
        ownerContributions: ownerContributions as Prisma.InputJsonValue,
        teamId: teamRefId,
        quarter: activeQuarter.quarter,
        year,
        measurementUnit: t.unit,
        target: t.target,
        quarterlyGoal: t.target,
        qtdGoal: t.target,
        divisionType: "Cumulative",
        weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
        targetScale: t.scale,
        frequency: "weekly",
        status: "active",
        healthStatus: "on-track",
        createdBy: ownerIds[0]!,
      },
    });
    for (const ownerId of ownerIds) {
      for (let w = 1; w <= 6; w++) {
        const per = (t.target / ownerIds.length) / 13;
        await db.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: ownerId,
            weekNumber: w,
            value: Math.round(per * (0.7 + Math.random() * 0.6) * 100) / 100,
            createdBy: ownerId,
          },
        });
      }
    }
    kpiCount++;
  }
  console.log(`  ✓ KPIs: ${kpiCount} (with weekly values)`);

  // Priorities — deterministic 2 per member.
  const priorityStatuses = ["not-started", "on-track", "behind-schedule", "completed"];
  let priorityCount = 0;
  for (const m of memberAssignments) {
    const titles = pickN(QS_PRIORITY_TEMPLATES, 2);
    for (const baseTitle of titles) {
      const priority = await db.priority.create({
        data: {
          orgId,
          name: `${baseTitle} (${m.firstName})`,
          owner: m.id,
          teamId: teamIds[m.team],
          quarter: activeQuarter.quarter,
          year,
          startWeek: 1,
          endWeek: 13,
          overallStatus: rand(priorityStatuses),
          createdBy: m.id,
        },
      });
      for (let w = 1; w <= 13; w++) {
        await db.priorityWeeklyStatus.create({
          data: {
            priorityId: priority.id,
            weekNumber: w,
            status: w <= 4 ? rand(priorityStatuses) : "not-started",
          },
        });
      }
      priorityCount++;
    }
  }
  console.log(`  ✓ priorities: ${priorityCount}`);

  // WWW — deterministic 5 per member.
  let wwwCount = 0;
  for (const m of memberAssignments) {
    const picks = pickN(QS_WWW_TEMPLATES, 5);
    for (const what of picks) {
      const days = randInt(-7, 14);
      await db.wWWItem.create({
        data: {
          orgId,
          who: m.id,
          what,
          when: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          status: rand(["not-started", "in-progress", "completed"]),
          createdBy: m.id,
        },
      });
      wwwCount++;
    }
  }
  console.log(`  ✓ WWW items: ${wwwCount}`);
}

// ── 3. QUIKTRACK ────────────────────────────────────────────────────────────

const QT_TEAMS = [
  { name: "Backend Squad", color: "#2563eb" },
  { name: "Frontend Squad", color: "#10b981" },
];

const QT_PROJECTS = [
  { key: "MOR", name: "Moreyeahs Web Platform", description: "Customer-facing app", color: "#2563eb" },
  { key: "API", name: "Moreyeahs Core API", description: "Backend services", color: "#10b981" },
];

const QT_STATUSES = [
  { name: "Backlog", color: "#94a3b8", category: "BACKLOG", orderIndex: 0 },
  { name: "To Do", color: "#64748b", category: "TODO", orderIndex: 1 },
  { name: "In Progress", color: "#2563eb", category: "IN_PROGRESS", orderIndex: 2 },
  { name: "In Review", color: "#a855f7", category: "IN_PROGRESS", orderIndex: 3 },
  { name: "Done", color: "#10b981", category: "DONE", orderIndex: 4 },
];

const QT_ISSUE_TYPES = [
  { name: "Story", color: "#10b981", icon: "bookmark" },
  { name: "Task", color: "#2563eb", icon: "check-square" },
  { name: "Bug", color: "#ef4444", icon: "bug" },
  { name: "Epic", color: "#a855f7", icon: "layers" },
];

const QT_ISSUE_TITLES = [
  "Set up CI/CD pipeline",
  "Implement user authentication",
  "Build dashboard widgets",
  "Fix login redirect bug",
  "Add dark mode toggle",
  "Migrate to TypeScript 5",
  "Optimize SQL queries",
  "Write API documentation",
  "Add export to CSV",
  "Improve error logging",
  "Set up monitoring alerts",
  "Build settings page",
];

const QT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

async function wipeQuiktrack(orgId: string) {
  await db.$transaction([
    db.qtIssueLink.deleteMany({ where: { orgId } }),
    db.qtIssueComment.deleteMany({ where: { orgId } }),
    db.qtIssueHistory.deleteMany({ where: { orgId } }),
    db.qtTimesheetEntry.deleteMany({ where: { orgId } }),
    db.qtIssue.deleteMany({ where: { orgId } }),
    db.qtSprint.deleteMany({ where: { project: { orgId } } }),
    db.qtIssueStatus.deleteMany({ where: { project: { orgId } } }),
    db.qtIssueType.deleteMany({ where: { project: { orgId } } }),
    db.qtProjectMember.deleteMany({ where: { project: { orgId } } }),
    db.qtProjectTeam.deleteMany({ where: { project: { orgId } } }),
    db.qtPage.deleteMany({ where: { project: { orgId } } }),
    db.qtDoc.deleteMany({ where: { orgId } }),
    db.qtProject.deleteMany({ where: { orgId } }),
    db.qtTeamMember.deleteMany({ where: { team: { orgId } } }),
    db.qtTeam.deleteMany({ where: { orgId } }),
  ]);
}

async function seedQuiktrack(orgId: string, userIds: Record<string, string>) {
  console.log("\n🎯 Seeding QuikTrack (Projects / Issues / Sprints)…");
  await wipeQuiktrack(orgId);

  const adminId = userIds[ASHWIN_EMAIL]!;
  const dhwaniId = userIds["dhwani@moreyeahs.com"]!;
  const pravinId = userIds["pravin@moreyeahs.com"]!;
  const rishabId = userIds["rishab@moreyeahs.com"]!;
  const allUserIds = [adminId, dhwaniId, pravinId, rishabId];

  // QtTeams + members
  const qtTeamIds: string[] = [];
  for (const [i, t] of QT_TEAMS.entries()) {
    const team = await db.qtTeam.create({
      data: { orgId, name: t.name, color: t.color, leadUserId: i === 0 ? pravinId : dhwaniId },
    });
    qtTeamIds.push(team.id);
    const teamMembers = i === 0 ? [adminId, pravinId] : [dhwaniId, rishabId];
    for (const uid of teamMembers) {
      await db.qtTeamMember.create({ data: { teamId: team.id, userId: uid, role: "MEMBER" } });
    }
  }
  console.log(`  ✓ qtTeams: ${QT_TEAMS.length}`);

  // Projects
  let totalIssues = 0;
  for (const p of QT_PROJECTS) {
    const project = await db.qtProject.create({
      data: {
        orgId,
        projectKey: p.key,
        name: p.name,
        description: p.description,
        projectType: "software",
        color: p.color,
        status: "active",
        leadUserId: dhwaniId,
        startDate: new Date(),
        createdBy: adminId,
      },
    });

    for (const uid of allUserIds) {
      await db.qtProjectMember.create({
        data: {
          projectId: project.id,
          userId: uid,
          role: uid === adminId || uid === dhwaniId ? "ADMIN" : "MEMBER",
        },
      });
    }
    for (const tid of qtTeamIds) {
      await db.qtProjectTeam.create({ data: { projectId: project.id, teamId: tid } });
    }

    const statusIds: Record<string, string> = {};
    for (const s of QT_STATUSES) {
      const row = await db.qtIssueStatus.create({
        data: { projectId: project.id, name: s.name, color: s.color, category: s.category, orderIndex: s.orderIndex },
      });
      statusIds[s.name] = row.id;
    }
    for (const t of QT_ISSUE_TYPES) {
      await db.qtIssueType.create({
        data: { projectId: project.id, name: t.name, color: t.color, icon: t.icon, orderIndex: QT_ISSUE_TYPES.indexOf(t) },
      });
    }

    const sprint = await db.qtSprint.create({
      data: {
        projectId: project.id,
        name: `${p.key} Sprint 1`,
        goal: `Initial sprint for ${p.name}`,
        status: "ACTIVE",
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        startedAt: new Date(),
        createdBy: adminId,
      },
    });

    let issueCounter = 0;
    const epicTitles = ["Customer Onboarding", "Payment & Billing", "Reporting & Analytics"];
    const epicIds: string[] = [];
    for (const title of epicTitles) {
      issueCounter++;
      const epic = await db.qtIssue.create({
        data: {
          orgId,
          projectId: project.id,
          key: `${p.key}-${issueCounter}`,
          title,
          description: `${title} epic`,
          type: "EPIC",
          statusId: statusIds["In Progress"]!,
          priority: "HIGH",
          assigneeId: dhwaniId,
          reporterId: adminId,
          sprintId: sprint.id,
          startDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          storyPoints: 21,
          createdBy: adminId,
        },
      });
      epicIds.push(epic.id);
    }

    for (const title of QT_ISSUE_TITLES) {
      issueCounter++;
      const statusName = rand(QT_STATUSES).name;
      const assignee = rand(allUserIds);
      const issue = await db.qtIssue.create({
        data: {
          orgId,
          projectId: project.id,
          key: `${p.key}-${issueCounter}`,
          title,
          description: `Description for: ${title}`,
          type: rand(["TASK", "STORY", "BUG"]),
          statusId: statusIds[statusName]!,
          priority: rand(QT_PRIORITIES),
          assigneeId: assignee,
          reporterId: dhwaniId,
          sprintId: sprint.id,
          epicId: rand(epicIds),
          startDate: new Date(),
          dueDate: new Date(Date.now() + randInt(3, 21) * 24 * 3600 * 1000),
          storyPoints: rand([1, 2, 3, 5, 8]),
          createdBy: dhwaniId,
        },
      });

      for (let i = 0; i < randInt(0, 2); i++) {
        await db.qtIssueComment.create({
          data: {
            orgId,
            projectId: project.id,
            issueId: issue.id,
            userId: rand(allUserIds),
            body: rand([
              "Looks good, ready to merge.",
              "Can you add a unit test?",
              "PR is up for review.",
              "Re-tested, all good.",
            ]),
          },
        });
      }
      await db.qtIssueHistory.create({
        data: { orgId, projectId: project.id, issueId: issue.id, userId: assignee, field: "status", oldValue: "Backlog", newValue: statusName },
      });
      if (Math.random() > 0.5) {
        await db.qtTimesheetEntry.create({
          data: {
            orgId,
            userId: assignee,
            projectId: project.id,
            issueId: issue.id,
            entryDate: new Date(),
            hours: rand([0.5, 1, 2, 3, 4]),
            description: `Worked on ${title}`,
            createdBy: assignee,
          },
        });
      }
    }

    await db.qtPage.create({
      data: {
        projectId: project.id,
        title: `${p.name} Wiki`,
        content: `# ${p.name}\n\nWelcome.`,
        authorId: dhwaniId,
        createdBy: dhwaniId,
      },
    });
    await db.qtDoc.create({
      data: {
        orgId,
        projectId: project.id,
        title: `${p.name} Architecture`,
        content: `Architecture overview for ${p.name}.`,
        createdBy: dhwaniId,
      },
    });

    totalIssues += issueCounter;
    console.log(`  ✓ project ${p.key}: ${issueCounter} issues`);
  }
  console.log(`  ✓ total issues across ${QT_PROJECTS.length} projects: ${totalIssues}`);
}

// ── 4. QUIKSOCIAL ───────────────────────────────────────────────────────────

const QSOC_BRANDS = [
  {
    name: "Moreyeahs",
    industry: "SaaS / Technology Services",
    websiteUrl: "https://moreyeahs.com",
    about: "Moreyeahs builds digital products and services for ambitious teams.",
    tagline: "More yeahs, less meh.",
    brandVoice: "Confident, modern, friendly.",
    country: "IN",
    primaryColors: ["#0066cc", "#1f2937"],
    accentColor: "#f59e0b",
    brandTone: ["confident", "modern", "friendly"],
    brandValues: ["craft", "speed", "transparency"],
    keywords: ["saas", "consulting", "engineering"],
    hashtags: ["#moreyeahs", "#engineering", "#startups"],
    isDefault: true,
  },
  {
    name: "Moreyeahs Studios",
    industry: "Design & Branding",
    websiteUrl: "https://moreyeahs.com/studios",
    about: "Design-led product studio inside Moreyeahs.",
    tagline: "Design that compounds.",
    brandVoice: "Crisp, opinionated, minimal.",
    country: "IN",
    primaryColors: ["#111827", "#6366f1"],
    accentColor: "#22d3ee",
    brandTone: ["crisp", "minimal"],
    brandValues: ["taste", "rigor"],
    keywords: ["design", "brand", "studio"],
    hashtags: ["#moreyeahsstudios", "#design"],
    isDefault: false,
  },
];

const QSOC_PRODUCTS = [
  { name: "Moreyeahs Insight Suite", description: "All-in-one analytics for product teams.", price: "29900", currency: "INR", sku: "INS-SUITE", category: "SaaS" },
  { name: "Moreyeahs Lite", description: "Free-tier analytics for early teams.", price: "0", currency: "INR", sku: "INS-LITE", category: "SaaS" },
];

const QSOC_SERVICES = [
  { name: "Design System Audit", description: "Two-week audit of your design system.", pricing: "75000", currency: "INR", duration: "2 weeks", category: "Consulting" },
  { name: "Quarterly Design Sprint", description: "Embedded design sprint with your team.", pricing: "150000", currency: "INR", duration: "1 quarter", category: "Engagement" },
];

const QSOC_ASSETS = [
  { name: "Hero banner", type: "image", url: "https://placehold.co/1200x630.png", category: "banner" },
  { name: "Founder portrait", type: "image", url: "https://placehold.co/600x600.png", category: "team" },
  { name: "Product flat lay", type: "image", url: "https://placehold.co/1080x1080.png", category: "product" },
];

const QSOC_PLATFORMS = ["instagram", "facebook", "linkedin", "twitter"];

const QSOC_POSTS = [
  "We just shipped Moreyeahs v2 — faster, simpler, brighter.",
  "Customer story: how Moreyeahs cut review time by 60%.",
  "Behind the scenes — team offsite at Hinjewadi this week.",
  "Hiring: senior product designer (remote OK).",
  "Quick tip: cache your AI prompts to halve costs.",
  "New on the blog — our take on AI-assisted product reviews.",
];

async function wipeQuiksocial(orgId: string) {
  await db.$transaction([
    db.post.deleteMany({ where: { orgId } }),
    db.campaign.deleteMany({ where: { orgId } }),
    db.assetLibrary.deleteMany({ where: { orgId } }),
    db.product.deleteMany({ where: { orgId } }),
    db.service.deleteMany({ where: { orgId } }),
    db.socialAccount.deleteMany({ where: { orgId } }),
    db.userPreference.deleteMany({ where: { orgId } }),
    db.brandMembership.deleteMany({ where: { orgId } }),
    db.brandInviteAssignment.deleteMany({ where: { orgId } }),
    db.brandInvite.deleteMany({ where: { orgId } }),
    db.brand.deleteMany({ where: { orgId } }),
  ]);
}

async function seedQuiksocial(orgId: string, userIds: Record<string, string>) {
  console.log("\n📣 Seeding QuikSocial (Brands / Posts / Campaigns)…");
  await wipeQuiksocial(orgId);

  const adminId = userIds[ASHWIN_EMAIL]!;
  const dhwaniId = userIds["dhwani@moreyeahs.com"]!;
  const pravinId = userIds["pravin@moreyeahs.com"]!;
  const rishabId = userIds["rishab@moreyeahs.com"]!;
  const allEntries = [
    { id: adminId, email: ASHWIN_EMAIL, role: "owner" },
    { id: dhwaniId, email: "dhwani@moreyeahs.com", role: "editor" },
    { id: pravinId, email: "pravin@moreyeahs.com", role: "member" },
    { id: rishabId, email: "rishab@moreyeahs.com", role: "member" },
  ];

  for (const b of QSOC_BRANDS) {
    const brand = await db.brand.create({
      data: {
        orgId,
        name: b.name,
        industry: b.industry,
        websiteUrl: b.websiteUrl,
        about: b.about,
        tagline: b.tagline,
        brandVoice: b.brandVoice,
        country: b.country,
        isDefault: b.isDefault,
        primaryColors: b.primaryColors,
        accentColor: b.accentColor,
        brandTone: b.brandTone,
        brandValues: b.brandValues,
        keywords: b.keywords,
        hashtags: b.hashtags,
        createdBy: adminId,
      },
    });

    for (const m of allEntries) {
      await db.brandMembership.create({
        data: {
          orgId,
          brandId: brand.id,
          userId: m.id,
          email: m.email,
          role: m.role,
          invitedBy: adminId,
        },
      });
    }

    if (b.isDefault) {
      for (const p of QSOC_PRODUCTS) {
        await db.product.create({
          data: { orgId, brandId: brand.id, ...p, isActive: true, createdBy: adminId },
        });
      }
    } else {
      for (const s of QSOC_SERVICES) {
        await db.service.create({
          data: { orgId, brandId: brand.id, ...s, isActive: true, createdBy: adminId },
        });
      }
    }

    for (const a of QSOC_ASSETS) {
      await db.assetLibrary.create({
        data: { orgId, brandId: brand.id, ...a, isActive: true, createdBy: adminId },
      });
    }

    const campaign = await db.campaign.create({
      data: {
        orgId,
        brandId: brand.id,
        name: `${b.name} — ${new Date().getFullYear()} launch campaign`,
        describeConcept: `Seasonal campaign for ${b.name}.`,
        objective: "awareness",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        frequency: "weekly",
        weeklyDay: 3,
        postTime: "09:00",
        timezone: "Asia/Kolkata",
        totalPosts: 8,
        generatedPosts: 5,
        includeLogo: true,
        brandColorPrimary: b.primaryColors[0],
        brandColorAccent: b.accentColor,
        createdBy: dhwaniId,
      },
    });

    for (let i = 0; i < 8; i++) {
      const status = rand(["draft", "scheduled", "published", "approved", "rejected"]);
      const scheduledFor =
        status === "scheduled" || status === "approved"
          ? new Date(Date.now() + randInt(1, 14) * 24 * 3600 * 1000)
          : null;
      const publishedAt =
        status === "published" ? new Date(Date.now() - randInt(1, 30) * 24 * 3600 * 1000) : null;
      await db.post.create({
        data: {
          orgId,
          brandId: brand.id,
          campaignId: campaign.id,
          title: `Post ${i + 1} — ${b.name}`,
          content: rand(QSOC_POSTS),
          platform: rand(QSOC_PLATFORMS),
          status,
          scheduledFor,
          publishedAt,
          isAiGenerated: Math.random() > 0.5,
          likes: status === "published" ? randInt(5, 250) : 0,
          comments: status === "published" ? randInt(0, 30) : 0,
          shares: status === "published" ? randInt(0, 50) : 0,
          createdBy: dhwaniId,
        },
      });
    }
    console.log(`  ✓ brand: ${b.name} — 8 posts`);
  }

  const defaultBrand = await db.brand.findFirst({ where: { orgId, isDefault: true } });
  if (defaultBrand) {
    for (const m of allEntries) {
      await db.userPreference.create({
        data: { orgId, userId: m.id, activeBrandId: defaultBrand.id },
      });
    }
  }
}

// ── 5. QUIKINFRA ─────────────────────────────────────────────────────
// Construction is a parallel auth + data world: its own Prisma client, its
// own User table (CnUser → "app_quikinfra"."User"), scrypt passwords.
// We pre-create CnUser rows for the four Moreyeahs members so they can log
// in directly with email + password (no JIT round-trip), then seed master
// data scoped to tenantId = Moreyeahs orgId so construction data is isolated.

const QC_USERS_BY_ROLE: Record<string, { userType: string; roleKey: string }> = {
  super_admin: { userType: "ADMIN", roleKey: "tenant_admin" },
  org_admin: { userType: "ADMIN", roleKey: "tenant_admin" },
  member: { userType: "USER", roleKey: "site_engineer" },
};

const QC_COMPANY = {
  name: "Moreyeahs Construction",
  legalName: "Moreyeahs Construction Pvt Ltd",
  shortName: "Moreyeahs",
  gstin: "27MOREY0001A1Z5",
  pan: "MOREY0001A",
  cin: "U45200MH2020PTC987654",
  address: "Plot 12, Hinjewadi Phase 2",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411057",
  phone: "+91-9000000001",
  email: "construction@moreyeahs.com",
};

const QC_UOMS = [
  { code: "NOS", name: "Numbers", type: "count", precision: 0, isBase: true },
  { code: "KG", name: "Kilogram", type: "weight", precision: 3, isBase: true },
  { code: "MTR", name: "Metre", type: "length", precision: 2, isBase: true },
  { code: "SQM", name: "Square Metre", type: "area", precision: 2, isBase: true },
  { code: "CUM", name: "Cubic Metre", type: "volume", precision: 3, isBase: true },
  { code: "BAG", name: "Bag", type: "count", precision: 0, isBase: false },
];

const QC_GST = [
  { code: "GST0", description: "Exempt", rate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 },
  { code: "GST5", description: "5% GST", rate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5 },
  { code: "GST12", description: "12% GST", rate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12 },
  { code: "GST18", description: "18% GST", rate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18 },
  { code: "GST28", description: "28% GST", rate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28 },
];

const QC_TDS = [
  { section: "194C", description: "Contractors / sub-contractors", rate: 1, thresholdAmount: 30000 },
  { section: "194J", description: "Professional fees", rate: 10, thresholdAmount: 30000 },
];

const QC_DEPARTMENTS = [
  { code: "ENG", name: "Engineering" },
  { code: "PROC", name: "Procurement" },
  { code: "ACCT", name: "Accounts" },
];

const QC_WORK_CATEGORIES = [
  { name: "Civil Works", description: "Concrete, masonry, finishing", sacCode: "9954" },
  { name: "Electrical", description: "Wiring, lighting, fittings", sacCode: "9954" },
  { name: "Plumbing", description: "Sanitary, drainage, fittings", sacCode: "9954" },
];

const QC_COST_CENTERS = [
  { code: "HO", name: "Head Office" },
  { code: "P01", name: "Project Site 01" },
];

const QC_VENDORS = [
  { code: "V001", name: "Pune Steel Traders", legalName: "Pune Steel Traders Pvt Ltd", gstin: "27BBBBB0000A1Z5", pan: "BBBBB0000A", contactPerson: "Rajesh Kulkarni", phone: "+91-9111111111", email: "sales@punesteel.local", city: "Pune", state: "Maharashtra", paymentTerms: "Net 30", paymentTermsDays: 30, rating: 4 },
  { code: "V002", name: "Suraj Cement Co.", legalName: "Suraj Cement Co.", gstin: "27CCCCC0000A1Z5", pan: "CCCCC0000A", contactPerson: "Suraj Modi", phone: "+91-9222222222", email: "orders@surajcement.local", city: "Mumbai", state: "Maharashtra", paymentTerms: "Net 45", paymentTermsDays: 45, rating: 5 },
  { code: "V003", name: "Bharat Electricals", legalName: "Bharat Electricals", gstin: "27DDDDD0000A1Z5", pan: "DDDDD0000A", contactPerson: "Anita Sharma", phone: "+91-9333333333", email: "info@bharatelec.local", city: "Pune", state: "Maharashtra", paymentTerms: "Net 30", paymentTermsDays: 30, rating: 4 },
];

const QC_CUSTOMERS = [
  { code: "C001", name: "Lotus Realty Group", contactPerson: "Mehul Shah", phone: "+91-9444444444", email: "projects@lotusrealty.local", city: "Mumbai", state: "Maharashtra", gstin: "27EEEEE0000A1Z5" },
  { code: "C002", name: "Greenfield Developers", contactPerson: "Pooja Singh", phone: "+91-9555555555", email: "ops@greenfield.local", city: "Pune", state: "Maharashtra", gstin: "27FFFFF0000A1Z5" },
];

const QC_CONTRACTORS = [
  { code: "CON01", name: "Shivaji Builders", contactPerson: "Shivaji Pawar", phone: "+91-9666666666", city: "Pune", state: "Maharashtra", licenseNo: "PWD/CL/2021/123", specialization: "Civil" },
  { code: "CON02", name: "Bharat Plumbing Works", contactPerson: "Ramesh Nair", phone: "+91-9777777777", city: "Pune", state: "Maharashtra", licenseNo: "PWD/PL/2022/456", specialization: "Plumbing" },
];

const QC_ITEM_GROUPS = [{ name: "Cement" }, { name: "Steel" }, { name: "Electrical" }, { name: "Plumbing" }];

const QC_ITEMS = [
  { code: "ITM001", name: "OPC 53 Grade Cement Bag (50kg)", group: "Cement", uom: "BAG", hsnCode: "2523", gstRate: 28, standardRate: 380 },
  { code: "ITM002", name: "TMT Steel Bar 12mm (1m)", group: "Steel", uom: "MTR", hsnCode: "7214", gstRate: 18, standardRate: 65 },
  { code: "ITM003", name: "TMT Steel Bar 16mm (1m)", group: "Steel", uom: "MTR", hsnCode: "7214", gstRate: 18, standardRate: 95 },
  { code: "ITM004", name: "PVC Conduit Pipe 25mm", group: "Electrical", uom: "MTR", hsnCode: "3917", gstRate: 18, standardRate: 35 },
  { code: "ITM005", name: "Copper Wire 2.5mm", group: "Electrical", uom: "MTR", hsnCode: "8544", gstRate: 18, standardRate: 18 },
  { code: "ITM006", name: "GI Pipe 1 inch", group: "Plumbing", uom: "MTR", hsnCode: "7306", gstRate: 18, standardRate: 220 },
];

const QC_TERMS = [
  { title: "Standard PO terms", body: "Payment within 30 days. Goods to be delivered to site as per delivery schedule.", applicableTo: "po", isDefault: true },
  { title: "Standard WO terms", body: "Work to commence within 7 days of issue. Quality as per IS standards.", applicableTo: "wo", isDefault: true },
  { title: "RFQ terms", body: "Submit quotation within 7 days. Validity 30 days.", applicableTo: "rfq", isDefault: true },
];

async function wipeQuikconstruction(tenantId: string) {
  // Delete in dependency order — transactions first, then assets/machinery,
  // then locations, then children of company/project, then company + project
  // + users. The procurement chain (PR→PO→GRN→Stock→Issue) is wiped first
  // because it has FKs back into project/company/items/locations.
  await qc.$transaction([
    // Transactions (depend on project + items + locations + vendors)
    qc.cnDPRMaterialEntry.deleteMany({ where: { dpr: { tenantId, orgId: tenantId } } }),
    qc.cnDPRMachineryEntry.deleteMany({ where: { dpr: { tenantId, orgId: tenantId } } }),
    qc.cnDPRLabourEntry.deleteMany({ where: { dpr: { tenantId, orgId: tenantId } } }),
    qc.cnDPRWorkItem.deleteMany({ where: { dpr: { tenantId, orgId: tenantId } } }),
    qc.cnDailyProgressReport.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnMaterialIssueLine.deleteMany({ where: { issue: { tenantId, orgId: tenantId } } }),
    qc.cnMaterialIssue.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnStockLedger.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnGRNLine.deleteMany({ where: { grn: { tenantId, orgId: tenantId } } }),
    qc.cnGoodsReceiptNote.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnPurchaseOrderLine.deleteMany({ where: { po: { tenantId, orgId: tenantId } } }),
    qc.cnPurchaseOrder.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnPurchaseRequisitionLine.deleteMany({ where: { pr: { tenantId, orgId: tenantId } } }),
    qc.cnPurchaseRequisition.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnWorkOrderLine.deleteMany({ where: { workOrder: { tenantId, orgId: tenantId } } }),
    qc.cnWorkOrder.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnBOQItem.deleteMany({ where: { tenantId, orgId: tenantId } }),
    // Masters
    qc.cnAsset.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnMachinery.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnLocation.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnCostCenter.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnWorkCategory.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnDepartment.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnTermsCondition.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnTDSCode.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnGSTCode.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnContractor.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnCustomer.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnVendor.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnItem.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnItemGroup.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnUOM.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnProject.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnFinancialYear.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnBank.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnCompany.deleteMany({ where: { tenantId, orgId: tenantId } }),
    qc.cnUser.deleteMany({ where: { tenantId, email: { in: [ASHWIN_EMAIL, ...NEW_USERS.map((u) => u.email)] } } }),
  ]);
}

async function seedQuikconstruction(orgId: string) {
  console.log("\n🏗️  Seeding QuikInfra (Company / Vendors / Items / Project)…");
  // Use the Moreyeahs orgId as both tenantId AND orgId in construction —
  // construction's data model duplicates these fields and we want to keep
  // Moreyeahs construction data isolated from the "default" tenant.
  const tenantId = orgId;

  await wipeQuikconstruction(tenantId);

  // 5a. Pre-provision CnUser rows for all four Moreyeahs members.
  const passwordHash = scryptHash(PASSWORD);
  const qcUsers: Array<{ email: string; firstName: string; lastName: string; role: string }> = [
    { email: ASHWIN_EMAIL, firstName: "Ashwin", lastName: "Singh", role: "super_admin" },
    ...NEW_USERS,
  ];
  const qcUserIds: Record<string, string> = {};
  for (const u of qcUsers) {
    const cfg = QC_USERS_BY_ROLE[u.role] ?? QC_USERS_BY_ROLE.member!;
    const username = u.email.split("@")[0]!;
    const created = await qc.cnUser.create({
      data: {
        tenantId,
        orgId: tenantId,
        email: u.email,
        username,
        fullName: `${u.firstName} ${u.lastName}`,
        passwordHash,
        userType: cfg.userType,
        roleKey: cfg.roleKey,
        modulesAssigned: [],
        projectsAssigned: [],
        status: "active",
        mustChangePassword: false,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        createdBy: "moreyeahs-seed",
        updatedBy: "moreyeahs-seed",
      },
    });
    qcUserIds[u.email] = created.id;
  }
  console.log(`  ✓ CnUsers: ${qcUsers.length}`);

  const adminId = qcUserIds[ASHWIN_EMAIL]!;
  const pmId = qcUserIds["dhwani@moreyeahs.com"]!;

  // 5b. Master data
  const company = await qc.cnCompany.create({
    data: { tenantId, orgId: tenantId, ...QC_COMPANY, createdBy: adminId, updatedBy: adminId },
  });

  await qc.cnBank.create({
    data: {
      tenantId, orgId: tenantId,
      companyId: company.id,
      bankName: "ICICI Bank", branchName: "Pune Camp",
      accountNo: "012345678901", ifscCode: "ICIC0000001",
      accountType: "current",
      createdBy: adminId, updatedBy: adminId,
    },
  });

  await qc.cnFinancialYear.create({
    data: {
      tenantId, orgId: tenantId,
      companyId: company.id,
      label: "FY 2026-27",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      isCurrent: true,
      createdBy: adminId, updatedBy: adminId,
    },
  });

  for (const u of QC_UOMS) {
    await qc.cnUOM.create({ data: { tenantId, orgId: tenantId, ...u, createdBy: adminId, updatedBy: adminId } });
  }
  for (const g of QC_GST) {
    await qc.cnGSTCode.create({
      data: {
        tenantId, orgId: tenantId,
        code: g.code, description: g.description,
        rate: new QcPrisma.Decimal(g.rate),
        cgstRate: new QcPrisma.Decimal(g.cgstRate),
        sgstRate: new QcPrisma.Decimal(g.sgstRate),
        igstRate: new QcPrisma.Decimal(g.igstRate),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  for (const t of QC_TDS) {
    await qc.cnTDSCode.create({
      data: {
        tenantId, orgId: tenantId,
        section: t.section, description: t.description,
        rate: new QcPrisma.Decimal(t.rate),
        thresholdAmount: new QcPrisma.Decimal(t.thresholdAmount),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  for (const d of QC_DEPARTMENTS) {
    await qc.cnDepartment.create({ data: { tenantId, orgId: tenantId, ...d, createdBy: adminId, updatedBy: adminId } });
  }
  for (const w of QC_WORK_CATEGORIES) {
    await qc.cnWorkCategory.create({ data: { tenantId, orgId: tenantId, ...w, createdBy: adminId, updatedBy: adminId } });
  }
  for (const c of QC_COST_CENTERS) {
    await qc.cnCostCenter.create({ data: { tenantId, orgId: tenantId, ...c, createdBy: adminId, updatedBy: adminId } });
  }
  for (const v of QC_VENDORS) {
    await qc.cnVendor.create({ data: { tenantId, orgId: tenantId, ...v, createdBy: adminId, updatedBy: adminId } });
  }
  const customerIds: Record<string, string> = {};
  for (const c of QC_CUSTOMERS) {
    const row = await qc.cnCustomer.create({ data: { tenantId, orgId: tenantId, ...c, createdBy: adminId, updatedBy: adminId } });
    customerIds[c.code] = row.id;
  }
  for (const c of QC_CONTRACTORS) {
    await qc.cnContractor.create({ data: { tenantId, orgId: tenantId, ...c, createdBy: adminId, updatedBy: adminId } });
  }
  const groupIds: Record<string, string> = {};
  for (const g of QC_ITEM_GROUPS) {
    const row = await qc.cnItemGroup.create({ data: { tenantId, orgId: tenantId, name: g.name, createdBy: adminId, updatedBy: adminId } });
    groupIds[g.name] = row.id;
  }
  const uomRows = await qc.cnUOM.findMany({ where: { tenantId, orgId: tenantId } });
  const uomByCode: Record<string, string> = Object.fromEntries(uomRows.map((u) => [u.code, u.id]));
  for (const it of QC_ITEMS) {
    await qc.cnItem.create({
      data: {
        tenantId, orgId: tenantId,
        code: it.code, name: it.name,
        groupId: groupIds[it.group]!,
        uomId: uomByCode[it.uom]!,
        hsnCode: it.hsnCode,
        gstRate: new QcPrisma.Decimal(it.gstRate),
        standardRate: new QcPrisma.Decimal(it.standardRate),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  for (const t of QC_TERMS) {
    await qc.cnTermsCondition.create({ data: { tenantId, orgId: tenantId, ...t, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`  ✓ masters: ${QC_UOMS.length} UOMs, ${QC_GST.length} GST, ${QC_TDS.length} TDS, ${QC_VENDORS.length} vendors, ${QC_CUSTOMERS.length} customers, ${QC_CONTRACTORS.length} contractors, ${QC_ITEMS.length} items`);

  // 5c. Project + locations + machinery + asset
  const project = await qc.cnProject.create({
    data: {
      tenantId, orgId: tenantId,
      code: "PRJ001",
      name: "Lotus Heights — Tower A",
      description: "10-storey residential tower, Pune",
      projectType: "Residential",
      companyId: company.id,
      clientId: customerIds["C001"],
      address: "Survey 145/2, Hinjewadi Phase 2",
      city: "Pune", state: "Maharashtra", pincode: "411057",
      startDate: new Date(),
      expectedEndDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      projectValue: new QcPrisma.Decimal(75000000),
      budget: new QcPrisma.Decimal(72000000),
      projectManagerId: pmId,
      createdBy: adminId, updatedBy: adminId,
    },
  });

  await qc.cnLocation.createMany({
    data: [
      { tenantId, orgId: tenantId, code: "HO-PUNE", name: "Head Office Pune", type: "head_office", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
      { tenantId, orgId: tenantId, code: "SITE-PRJ001", name: "Lotus Heights Site", type: "site", projectId: project.id, address: "Survey 145/2, Hinjewadi Phase 2", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
      { tenantId, orgId: tenantId, code: "WH-PUNE", name: "Pune Central Warehouse", type: "warehouse", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
    ],
  });

  const machinery = await qc.cnMachinery.create({
    data: { tenantId, orgId: tenantId, code: "MAC001", name: "Tata Hitachi EX 200", type: "Excavator", make: "Tata Hitachi", model: "EX 200", registrationNo: "MH12-AB-1234", projectId: project.id, fuelType: "Diesel", capacity: "20T", createdBy: adminId, updatedBy: adminId },
  });
  await qc.cnAsset.create({
    data: { tenantId, orgId: tenantId, assetCode: "AST001", name: "Site Office Container", category: "Infrastructure", purchaseDate: new Date("2025-01-15"), purchaseValue: new QcPrisma.Decimal(150000), createdBy: adminId, updatedBy: adminId },
  });
  console.log(`  ✓ project: ${project.name} (PM=Dhwani), 3 locations, 1 machinery, 1 asset`);

  // 5d. Transactional records — every Moreyeahs user gets at least one PR / PO
  // / GRN / MI / DPR they're tied to so each user has audit-trail data when
  // they sign in. This is the part the user previously saw as empty.

  // Pull master ids we'll need.
  const itemRows = await qc.cnItem.findMany({ where: { tenantId, orgId: tenantId } });
  const itemByCode: Record<string, typeof itemRows[number]> = Object.fromEntries(itemRows.map((i) => [i.code, i]));
  const vendorRows = await qc.cnVendor.findMany({ where: { tenantId, orgId: tenantId } });
  const vendorByCode: Record<string, typeof vendorRows[number]> = Object.fromEntries(vendorRows.map((v) => [v.code, v]));
  const contractorRows = await qc.cnContractor.findMany({ where: { tenantId, orgId: tenantId } });
  const gstRows = await qc.cnGSTCode.findMany({ where: { tenantId, orgId: tenantId } });
  const gst18 = gstRows.find((g) => g.code === "GST18")!;
  const gst28 = gstRows.find((g) => g.code === "GST28")!;
  const locationRows = await qc.cnLocation.findMany({ where: { tenantId, orgId: tenantId } });
  const siteLocation = locationRows.find((l) => l.code === "SITE-PRJ001")!;
  const warehouseLocation = locationRows.find((l) => l.code === "WH-PUNE")!;

  const pravinId = qcUserIds["pravin@moreyeahs.com"]!;
  const rishabId = qcUserIds["rishab@moreyeahs.com"]!;

  // ── BOQ items — top-level groupings with leaf line items ──────────────
  const boqGroups = [
    { code: "A", description: "Substructure", category: "Civil" },
    { code: "B", description: "Superstructure", category: "Civil" },
    { code: "C", description: "MEP — Plumbing & Electrical", category: "Electrical" },
  ];
  const boqGroupIds: Record<string, string> = {};
  for (const [i, g] of boqGroups.entries()) {
    const row = await qc.cnBOQItem.create({
      data: {
        tenantId, orgId: tenantId,
        projectId: project.id,
        depth: 0, sortOrder: i,
        isLeaf: false,
        category: g.category,
        itemCode: g.code,
        description: g.description,
        createdBy: adminId, updatedBy: adminId,
      },
    });
    boqGroupIds[g.code] = row.id;
  }
  const boqLeaves = [
    { parent: "A", code: "A.1", desc: "Excavation up to 1.5m depth", uom: "CUM", qty: 1500, rate: 280 },
    { parent: "A", code: "A.2", desc: "PCC 1:4:8 in foundation", uom: "CUM", qty: 250, rate: 5800 },
    { parent: "A", code: "A.3", desc: "RCC M25 in footing", uom: "CUM", qty: 320, rate: 8400 },
    { parent: "B", code: "B.1", desc: "Brick masonry in 1:6", uom: "CUM", qty: 850, rate: 6200 },
    { parent: "B", code: "B.2", desc: "Reinforced concrete columns", uom: "CUM", qty: 420, rate: 9100 },
    { parent: "C", code: "C.1", desc: "PVC conduit + wiring (per floor)", uom: "MTR", qty: 4500, rate: 320 },
  ];
  const boqUomRows = uomRows;
  const boqUomByCode: Record<string, string> = Object.fromEntries(boqUomRows.map((u) => [u.code, u.id]));
  for (const [i, leaf] of boqLeaves.entries()) {
    const amount = leaf.qty * leaf.rate;
    await qc.cnBOQItem.create({
      data: {
        tenantId, orgId: tenantId,
        projectId: project.id,
        parentId: boqGroupIds[leaf.parent],
        depth: 1, sortOrder: i,
        isLeaf: true,
        category: "Civil",
        itemCode: leaf.code,
        description: leaf.desc,
        uomId: boqUomByCode[leaf.uom],
        quantity: new QcPrisma.Decimal(leaf.qty),
        contractRate: new QcPrisma.Decimal(leaf.rate),
        workingRate: new QcPrisma.Decimal(leaf.rate),
        contractAmount: new QcPrisma.Decimal(amount),
        workingAmount: new QcPrisma.Decimal(amount),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  console.log(`  ✓ BOQ: ${boqGroups.length} groups + ${boqLeaves.length} line items`);

  // ── Purchase Requisitions — one per non-admin member ──────────────────
  const prDefs = [
    { number: "PR-MOR-2627-0001", requestedBy: pravinId, requestedByLabel: "Pravin", status: "approved", lines: [{ item: "ITM001", qty: 200, rate: 380 }, { item: "ITM002", qty: 1500, rate: 65 }] },
    { number: "PR-MOR-2627-0002", requestedBy: rishabId, requestedByLabel: "Rishab", status: "approved", lines: [{ item: "ITM004", qty: 800, rate: 35 }, { item: "ITM005", qty: 2000, rate: 18 }] },
    { number: "PR-MOR-2627-0003", requestedBy: pmId, requestedByLabel: "Dhwani", status: "submitted", lines: [{ item: "ITM006", qty: 600, rate: 220 }] },
  ];
  const prByNumber: Record<string, { id: string; lineMap: Map<string, string> }> = {};
  for (const pr of prDefs) {
    const estimatedTotal = pr.lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
    const created = await qc.cnPurchaseRequisition.create({
      data: {
        tenantId, orgId: tenantId,
        prNumber: pr.number,
        projectId: project.id,
        requestedById: pr.requestedBy,
        requestDate: new Date(),
        requiredDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        purpose: `Materials for ${pr.requestedByLabel}'s scope`,
        estimatedTotal: new QcPrisma.Decimal(estimatedTotal),
        deliveryLocationId: siteLocation.id,
        status: pr.status,
        createdBy: pr.requestedBy, updatedBy: pr.requestedBy,
      },
    });
    const lineMap = new Map<string, string>();
    for (const line of pr.lines) {
      const item = itemByCode[line.item]!;
      const lineRow = await qc.cnPurchaseRequisitionLine.create({
        data: {
          prId: created.id,
          itemId: item.id,
          uomId: item.uomId,
          quantity: new QcPrisma.Decimal(line.qty),
          estimatedRate: new QcPrisma.Decimal(line.rate),
          estimatedAmount: new QcPrisma.Decimal(line.qty * line.rate),
        },
      });
      lineMap.set(line.item, lineRow.id);
    }
    prByNumber[pr.number] = { id: created.id, lineMap };
  }
  console.log(`  ✓ PRs: ${prDefs.length} (created by ${prDefs.map((p) => p.requestedByLabel).join(", ")})`);

  // ── Purchase Orders — one per approved PR ─────────────────────────────
  const poDefs = [
    { number: "PO-MOR-2627-0001", prNumber: "PR-MOR-2627-0001", vendorCode: "V002", createdBy: adminId, status: "approved", lines: [{ item: "ITM001", qty: 200, rate: 380 }, { item: "ITM002", qty: 1500, rate: 65 }] },
    { number: "PO-MOR-2627-0002", prNumber: "PR-MOR-2627-0002", vendorCode: "V003", createdBy: pmId, status: "approved", lines: [{ item: "ITM004", qty: 800, rate: 35 }, { item: "ITM005", qty: 2000, rate: 18 }] },
  ];
  const poByNumber: Record<string, { id: string; lineMap: Map<string, string>; vendorId: string }> = {};
  for (const po of poDefs) {
    const subtotal = po.lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
    const totalAmount = subtotal + taxAmount;
    const vendor = vendorByCode[po.vendorCode]!;
    const created = await qc.cnPurchaseOrder.create({
      data: {
        tenantId, orgId: tenantId,
        poNumber: po.number,
        projectId: project.id,
        vendorId: vendor.id,
        poDate: new Date(),
        deliveryDate: new Date(Date.now() + 10 * 24 * 3600 * 1000),
        deliveryLocationId: siteLocation.id,
        deliveryAddress: `${siteLocation.name}, ${siteLocation.address ?? ""}`,
        subtotal: new QcPrisma.Decimal(subtotal),
        taxAmount: new QcPrisma.Decimal(taxAmount),
        totalAmount: new QcPrisma.Decimal(totalAmount),
        totalIGST: new QcPrisma.Decimal(0),
        totalCGST: new QcPrisma.Decimal(taxAmount / 2),
        totalSGST: new QcPrisma.Decimal(taxAmount / 2),
        purpose: "Project execution materials",
        contactPerson: "Site office",
        status: po.status,
        paymentTermsDays: vendor.paymentTermsDays ?? 30,
        createdBy: po.createdBy, updatedBy: po.createdBy,
      },
    });
    const lineMap = new Map<string, string>();
    for (const line of po.lines) {
      const item = itemByCode[line.item]!;
      const lineSubtotal = line.qty * line.rate;
      const lineTax = Math.round(lineSubtotal * 0.18 * 100) / 100;
      const lineRow = await qc.cnPurchaseOrderLine.create({
        data: {
          poId: created.id,
          itemId: item.id,
          uomId: item.uomId,
          quantity: new QcPrisma.Decimal(line.qty),
          orderedQty: new QcPrisma.Decimal(line.qty),
          pendingQty: new QcPrisma.Decimal(line.qty),
          unitRate: new QcPrisma.Decimal(line.rate),
          amount: new QcPrisma.Decimal(lineSubtotal),
          gstCodeId: gst18.id,
          gstRate: new QcPrisma.Decimal(18),
          cgstAmount: new QcPrisma.Decimal(lineTax / 2),
          sgstAmount: new QcPrisma.Decimal(lineTax / 2),
          taxAmount: new QcPrisma.Decimal(lineTax),
          totalAmount: new QcPrisma.Decimal(lineSubtotal + lineTax),
        },
      });
      lineMap.set(line.item, lineRow.id);
    }
    poByNumber[po.number] = { id: created.id, lineMap, vendorId: vendor.id };
  }
  console.log(`  ✓ POs: ${poDefs.length} (subtotal+GST 18%)`);

  // ── GRNs — receive against the first PO ───────────────────────────────
  const grn1Po = poByNumber["PO-MOR-2627-0001"]!;
  const grn1Lines = [
    { item: "ITM001", recvQty: 200, rate: 380 },
    { item: "ITM002", recvQty: 1500, rate: 65 },
  ];
  const grn1 = await qc.cnGoodsReceiptNote.create({
    data: {
      tenantId, orgId: tenantId,
      grnNumber: "GRN-MOR-2627-0001",
      poId: grn1Po.id,
      projectId: project.id,
      vendorId: grn1Po.vendorId,
      grnDate: new Date(),
      locationId: warehouseLocation.id,
      receivedById: rishabId,
      challanNo: "CH-2026-001",
      challanDate: new Date(),
      vehicleNo: "MH12-AB-7777",
      overallQualityStatus: "Accepted",
      status: "approved",
      createdBy: rishabId, updatedBy: rishabId,
    },
  });
  for (const line of grn1Lines) {
    const item = itemByCode[line.item]!;
    const poLineId = grn1Po.lineMap.get(line.item)!;
    const amount = line.recvQty * line.rate;
    await qc.cnGRNLine.create({
      data: {
        grnId: grn1.id,
        poLineId,
        itemId: item.id,
        receivedQty: new QcPrisma.Decimal(line.recvQty),
        acceptedQty: new QcPrisma.Decimal(line.recvQty),
        uomId: item.uomId,
        unitRate: new QcPrisma.Decimal(line.rate),
        amount: new QcPrisma.Decimal(amount),
        qualityStatus: "accepted",
      },
    });
    // Stock ledger entry — append-only.
    await qc.cnStockLedger.create({
      data: {
        tenantId, orgId: tenantId,
        projectId: project.id,
        locationId: warehouseLocation.id,
        itemId: item.id,
        transactionType: "grn",
        transactionRefId: grn1.id,
        transactionRefNumber: grn1.grnNumber,
        transactionDate: new Date(),
        qtyIn: new QcPrisma.Decimal(line.recvQty),
        unitRate: new QcPrisma.Decimal(line.rate),
        amount: new QcPrisma.Decimal(amount),
        uomId: item.uomId,
        createdBy: rishabId,
      },
    });
  }

  const grn2Po = poByNumber["PO-MOR-2627-0002"]!;
  const grn2Lines = [
    { item: "ITM004", recvQty: 600, rate: 35 }, // partial receipt of 800
    { item: "ITM005", recvQty: 2000, rate: 18 },
  ];
  const grn2 = await qc.cnGoodsReceiptNote.create({
    data: {
      tenantId, orgId: tenantId,
      grnNumber: "GRN-MOR-2627-0002",
      poId: grn2Po.id,
      projectId: project.id,
      vendorId: grn2Po.vendorId,
      grnDate: new Date(),
      locationId: warehouseLocation.id,
      receivedById: pravinId,
      challanNo: "CH-2026-002",
      challanDate: new Date(),
      vehicleNo: "MH12-CD-8888",
      overallQualityStatus: "Accepted",
      status: "approved",
      createdBy: pravinId, updatedBy: pravinId,
    },
  });
  for (const line of grn2Lines) {
    const item = itemByCode[line.item]!;
    const poLineId = grn2Po.lineMap.get(line.item)!;
    const amount = line.recvQty * line.rate;
    await qc.cnGRNLine.create({
      data: {
        grnId: grn2.id,
        poLineId,
        itemId: item.id,
        receivedQty: new QcPrisma.Decimal(line.recvQty),
        acceptedQty: new QcPrisma.Decimal(line.recvQty),
        uomId: item.uomId,
        unitRate: new QcPrisma.Decimal(line.rate),
        amount: new QcPrisma.Decimal(amount),
        qualityStatus: "accepted",
      },
    });
    await qc.cnStockLedger.create({
      data: {
        tenantId, orgId: tenantId,
        projectId: project.id,
        locationId: warehouseLocation.id,
        itemId: item.id,
        transactionType: "grn",
        transactionRefId: grn2.id,
        transactionRefNumber: grn2.grnNumber,
        transactionDate: new Date(),
        qtyIn: new QcPrisma.Decimal(line.recvQty),
        unitRate: new QcPrisma.Decimal(line.rate),
        amount: new QcPrisma.Decimal(amount),
        uomId: item.uomId,
        createdBy: pravinId,
      },
    });
  }
  console.log(`  ✓ GRNs: 2 (received by Rishab, Pravin) + stock ledger entries`);

  // ── Material Issues — issue stock to site ─────────────────────────────
  const miDefs = [
    {
      number: "MI-MOR-2627-0001", issuedBy: pravinId, issuedByLabel: "Pravin",
      lines: [{ item: "ITM001", qty: 80, rate: 380 }, { item: "ITM002", qty: 600, rate: 65 }],
    },
    {
      number: "MI-MOR-2627-0002", issuedBy: rishabId, issuedByLabel: "Rishab",
      lines: [{ item: "ITM004", qty: 250, rate: 35 }],
    },
  ];
  for (const mi of miDefs) {
    const total = mi.lines.reduce((s, l) => s + l.qty * l.rate, 0);
    const issue = await qc.cnMaterialIssue.create({
      data: {
        tenantId, orgId: tenantId,
        issueNumber: mi.number,
        projectId: project.id,
        projectName: project.name,
        locationId: warehouseLocation.id,
        locationName: warehouseLocation.name,
        issuedById: mi.issuedBy,
        issueDate: new Date(),
        issueType: "site_consumption",
        purpose: "Site consumption — foundation works",
        transactionAmount: new QcPrisma.Decimal(total),
        lineCount: mi.lines.length,
        status: "approved",
        approvedAt: new Date(),
        approvedBy: adminId,
        createdBy: mi.issuedBy, updatedBy: mi.issuedBy,
      },
    });
    for (const line of mi.lines) {
      const item = itemByCode[line.item]!;
      const amount = line.qty * line.rate;
      await qc.cnMaterialIssueLine.create({
        data: {
          issueId: issue.id,
          itemId: item.id,
          issuedQty: new QcPrisma.Decimal(line.qty),
          uomId: item.uomId,
          unitRate: new QcPrisma.Decimal(line.rate),
          amount: new QcPrisma.Decimal(amount),
        },
      });
      await qc.cnStockLedger.create({
        data: {
          tenantId, orgId: tenantId,
          projectId: project.id,
          locationId: warehouseLocation.id,
          itemId: item.id,
          transactionType: "issue",
          transactionRefId: issue.id,
          transactionRefNumber: issue.issueNumber,
          transactionDate: new Date(),
          qtyOut: new QcPrisma.Decimal(line.qty),
          unitRate: new QcPrisma.Decimal(line.rate),
          amount: new QcPrisma.Decimal(amount),
          uomId: item.uomId,
          createdBy: mi.issuedBy,
        },
      });
    }
  }
  console.log(`  ✓ Material Issues: ${miDefs.length} (issued by ${miDefs.map((m) => m.issuedByLabel).join(", ")}) + stock-out ledger entries`);

  // ── Daily Progress Reports — one per recent day, rotating authors ─────
  const dprAuthors = [
    { id: rishabId, label: "Rishab" },
    { id: pravinId, label: "Pravin" },
    { id: pmId, label: "Dhwani" },
  ];
  const dprWeather = ["Clear", "Cloudy", "Light rain"];
  for (const [i, author] of dprAuthors.entries()) {
    const reportDate = new Date(Date.now() - i * 24 * 3600 * 1000);
    const dpr = await qc.cnDailyProgressReport.create({
      data: {
        tenantId, orgId: tenantId,
        dprNumber: `DPR-MOR-2627-${String(i + 1).padStart(4, "0")}`,
        projectId: project.id,
        reportDate,
        submittedById: author.id,
        weatherCondition: dprWeather[i] ?? "Clear",
        remarks: `Day ${i + 1} progress: foundation + framing.`,
        status: "submitted",
        createdBy: author.id, updatedBy: author.id,
      },
    });
    // One BOQ work-item entry per DPR
    const boqLeafRow = await qc.cnBOQItem.findFirst({
      where: { tenantId, orgId: tenantId, projectId: project.id, isLeaf: true },
      orderBy: { sortOrder: "asc" },
    });
    if (boqLeafRow) {
      await qc.cnDPRWorkItem.create({
        data: {
          dprId: dpr.id,
          boqItemId: boqLeafRow.id,
          description: boqLeafRow.description,
          todayQty: new QcPrisma.Decimal(20 + i * 5),
          cumulativeQty: new QcPrisma.Decimal(80 + i * 25),
          uomId: boqLeafRow.uomId ?? boqUomByCode.CUM!,
          remarks: "On schedule",
        },
      });
    }
    await qc.cnDPRLabourEntry.create({
      data: {
        dprId: dpr.id,
        category: "Mason",
        skillType: "Skilled",
        count: 8,
        hoursWorked: new QcPrisma.Decimal(8),
      },
    });
    await qc.cnDPRMachineryEntry.create({
      data: {
        dprId: dpr.id,
        machineryId: machinery.id,
        hoursWorked: new QcPrisma.Decimal(6),
        fuelConsumed: new QcPrisma.Decimal(45),
      },
    });
    const cementItem = itemByCode["ITM001"]!;
    await qc.cnDPRMaterialEntry.create({
      data: {
        dprId: dpr.id,
        itemId: cementItem.id,
        consumedQty: new QcPrisma.Decimal(15 + i * 5),
        uomId: cementItem.uomId,
        remarks: "Foundation pour",
      },
    });
  }
  console.log(`  ✓ DPRs: ${dprAuthors.length} (submitted by ${dprAuthors.map((a) => a.label).join(", ")}) + work/labour/machinery/material entries`);

  // ── Work Order — one for the civil contractor ─────────────────────────
  const civilContractor = contractorRows.find((c) => c.code === "CON01")!;
  const wo = await qc.cnWorkOrder.create({
    data: {
      tenantId, orgId: tenantId,
      woNumber: "WO-MOR-2627-0001",
      projectId: project.id,
      contractorId: civilContractor.id,
      title: "Foundation civil works",
      description: "Excavation + PCC + RCC footing + brick masonry — substructure scope.",
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      totalAmount: new QcPrisma.Decimal(7500000),
      status: "approved",
      createdBy: adminId, updatedBy: adminId,
    },
  });
  // WO lines tied to BOQ items
  const boqLeavesForWO = await qc.cnBOQItem.findMany({
    where: { tenantId, orgId: tenantId, projectId: project.id, isLeaf: true },
    orderBy: { sortOrder: "asc" },
    take: 3,
  });
  for (const leaf of boqLeavesForWO) {
    await qc.cnWorkOrderLine.create({
      data: {
        woId: wo.id,
        boqItemId: leaf.id,
        description: leaf.description,
        quantity: leaf.quantity ?? new QcPrisma.Decimal(0),
        uomId: leaf.uomId!,
        negotiatedRate: leaf.workingRate ?? new QcPrisma.Decimal(0),
        amount: leaf.workingAmount ?? new QcPrisma.Decimal(0),
      },
    });
  }
  console.log(`  ✓ Work Order: ${wo.woNumber} (contractor=${civilContractor.name}) with ${boqLeavesForWO.length} BOQ-linked lines`);
}

// ── 6. MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Moreyeahs combined demo seed");

  const org = await db.org.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Org "${ORG_SLUG}" not found — aborting`);
  console.log(`✅ Org: ${org.name} (${org.id})`);

  const userIds = await ensureUsersAndAccess(org.id);

  await seedQuikscale(org.id, userIds);
  await seedQuiktrack(org.id, userIds);
  await seedQuiksocial(org.id, userIds);
  await seedQuikconstruction(org.id);

  console.log("\n🎉 Done. Login credentials:");
  console.log(`   ashwin@moreyeahs.com         (existing central password) — for QuikScale/QuikTrack/QuikSocial`);
  console.log(`   ashwin@moreyeahs.com         password: ${PASSWORD}     — for QuikInfra (separate auth)`);
  for (const u of NEW_USERS) {
    console.log(`   ${u.email.padEnd(28)} password: ${PASSWORD}     ${u.role}`);
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await qc.$disconnect();
  });
