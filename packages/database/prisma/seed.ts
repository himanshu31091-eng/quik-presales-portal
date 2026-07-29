import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Create default tenant
  const tenant = await prisma.org.create({
    data: {
      name: "Demo Company",
      slug: "demo-company",
      description: "Demo company for testing QuikScale",
      plan: "growth",
      brandColor: "#0066cc",
    },
  });

  console.log(`✅ Created tenant: ${tenant.name}`);

  // Hash password
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create users
  const ceo = await prisma.user.create({
    data: {
      email: "ceo@demo.com",
      firstName: "Alice",
      lastName: "Johnson",
      password: hashedPassword,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@demo.com",
      firstName: "Bob",
      lastName: "Smith",
      password: hashedPassword,
    },
  });

  const employee = await prisma.user.create({
    data: {
      email: "employee@demo.com",
      firstName: "Carol",
      lastName: "Williams",
      password: hashedPassword,
    },
  });

  console.log(`✅ Created 3 demo users`);

  // Create teams
  const engineeringTeam = await prisma.team.create({
    data: {
      tenantId: tenant.id,
      name: "Engineering",
      slug: "engineering",
      color: "#3b82f6",
    },
  });

  const salesTeam = await prisma.team.create({
    data: {
      tenantId: tenant.id,
      name: "Sales",
      slug: "sales",
      color: "#8b5cf6",
    },
  });

  console.log(`✅ Created 2 demo teams`);

  // Create memberships
  await prisma.orgMember.create({
    data: {
      tenantId: tenant.id,
      userId: ceo.id,
      role: "executive",
      status: "active",
    },
  });

  await prisma.orgMember.create({
    data: {
      tenantId: tenant.id,
      userId: manager.id,
      role: "manager",
      teamId: engineeringTeam.id,
      status: "active",
    },
  });

  await prisma.orgMember.create({
    data: {
      tenantId: tenant.id,
      userId: employee.id,
      role: "employee",
      teamId: engineeringTeam.id,
      status: "active",
    },
  });

  console.log(`✅ Created 3 demo memberships`);

  // Create sample KPIs
  const currentYear = new Date().getFullYear();

  const companyKPI = await prisma.kPI.create({
    data: {
      tenantId: tenant.id,
      name: "Annual Revenue",
      description: "Total company revenue target",
      owner: ceo.id,
      quarter: "Q1",
      year: currentYear,
      measurementUnit: "Currency",
      target: 1000000,
      quarterlyGoal: 250000,
      qtdGoal: 250000,
      qtdAchieved: 205000,
      progressPercent: 82,
      status: "active",
      healthStatus: "behind-schedule",
      createdBy: ceo.id,
    },
  });

  const teamKPI = await prisma.kPI.create({
    data: {
      tenantId: tenant.id,
      name: "Development Velocity",
      description: "Story points completed per sprint",
      owner: manager.id,
      teamId: engineeringTeam.id,
      parentKPIId: companyKPI.id,
      quarter: "Q1",
      year: currentYear,
      measurementUnit: "Number",
      target: 100,
      quarterlyGoal: 25,
      qtdGoal: 25,
      qtdAchieved: 23,
      progressPercent: 92,
      status: "active",
      healthStatus: "on-track",
      createdBy: manager.id,
    },
  });

  const individualKPI = await prisma.kPI.create({
    data: {
      tenantId: tenant.id,
      name: "Bugs Fixed",
      description: "Number of bugs closed",
      owner: employee.id,
      teamId: engineeringTeam.id,
      parentKPIId: teamKPI.id,
      quarter: "Q1",
      year: currentYear,
      measurementUnit: "Number",
      target: 20,
      quarterlyGoal: 5,
      qtdGoal: 5,
      qtdAchieved: 4,
      progressPercent: 80,
      status: "active",
      healthStatus: "behind-schedule",
      createdBy: manager.id,
    },
  });

  console.log(`✅ Created 3 sample KPIs (company → team → individual)`);

  // Create sample priorities
  const priority = await prisma.priority.create({
    data: {
      tenantId: tenant.id,
      name: "Launch Product V2",
      owner: ceo.id,
      quarter: "Q1",
      year: currentYear,
      startWeek: 1,
      endWeek: 13,
      overallStatus: "on-track",
      createdBy: ceo.id,
    },
  });

  // Add weekly statuses for priority
  for (let week = 1; week <= 13; week++) {
    await prisma.priorityWeeklyStatus.create({
      data: {
        priorityId: priority.id,
        weekNumber: week,
        status: week <= 3 ? "on-track" : "not-started",
      },
    });
  }

  console.log(`✅ Created 1 sample priority with weekly tracking`);

  // Create sample WWW items
  await prisma.wWWItem.create({
    data: {
      tenantId: tenant.id,
      who: manager.id,
      what: "Complete sprint planning",
      when: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      status: "in-progress",
      createdBy: ceo.id,
    },
  });

  await prisma.wWWItem.create({
    data: {
      tenantId: tenant.id,
      who: employee.id,
      what: "Review and merge pull requests",
      when: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      status: "not-started",
      createdBy: manager.id,
    },
  });

  console.log(`✅ Created 2 sample WWW items`);

  // Create sample meeting
  const meeting = await prisma.meeting.create({
    data: {
      tenantId: tenant.id,
      name: "Weekly Standup",
      cadence: "weekly",
      scheduledAt: new Date(),
      duration: 30,
      agenda: "Sprint progress, blockers, priorities",
      startedOnTime: true,
      endedOnTime: true,
      formatFollowed: true,
      createdBy: manager.id,
    },
  });

  // Add attendees
  await prisma.meetingAttendee.create({
    data: {
      meetingId: meeting.id,
      userId: manager.id,
      attended: true,
    },
  });

  await prisma.meetingAttendee.create({
    data: {
      meetingId: meeting.id,
      userId: employee.id,
      attended: true,
    },
  });

  console.log(`✅ Created 1 sample meeting with attendees`);

  // Create sample OPSP document
  const opsp = await prisma.oPSPDocument.create({
    data: {
      tenantId: tenant.id,
      year: currentYear,
      status: "final",
      createdBy: ceo.id,
    },
  });

  await prisma.oPSPSection.create({
    data: {
      documentId: opsp.id,
      sectionType: "core_values",
      content: "Innovation, Integrity, Impact",
    },
  });

  await prisma.oPSPSection.create({
    data: {
      documentId: opsp.id,
      sectionType: "purpose",
      content:
        "To empower teams to execute their vision and achieve exceptional results",
    },
  });

  console.log(`✅ Created 1 sample OPSP document with sections`);

  // Create sample personal plan
  await prisma.oPSPPlan.create({
    data: {
      tenantId: tenant.id,
      userId: ceo.id,
      relationships_long: "Build stronger mentoring relationships",
      relationships_1yr: "Mentor 2 leaders",
      relationships_90d: "Schedule 1:1s with direct reports",
      achievements_long: "Double company revenue",
      achievements_1yr: "Launch product V2",
      achievements_90d: "Complete product roadmap",
      rituals_long: "Daily exercise",
      rituals_1yr: "Gym 3x per week",
      rituals_90d: "Walk for 30 min daily",
      wealth_long: "Financial security for family",
      wealth_1yr: "Save $100k",
      wealth_90d: "Review investment portfolio",
      tags: ["faith", "family", "fitness"],
    },
  });

  console.log(`✅ Created 1 sample personal plan (OPSPPlan)`);

  // Create sample habit assessment
  await prisma.habitAssessment.create({
    data: {
      tenantId: tenant.id,
      assessmentDate: new Date(),
      quarter: "Q1",
      year: currentYear,
      habit1_vision: 7,
      habit2_meetings: 8,
      habit3_scoreboards: 6,
      habit4_accountable: 7,
      habit5_rhythm: 8,
      habit6_sticking: 5,
      habit7_cascading: 6,
      habit8_recognition: 7,
      habit9_training: 6,
      habit10_innovation: 5,
      averageScore: 6.5,
      maturityLevel: "developing",
      assessedBy: ceo.id,
    },
  });

  console.log(`✅ Created 1 sample habit assessment`);

  console.log("\n🎉 Database seeded successfully!");
  console.log("\nDemo login credentials:");
  console.log("  CEO:      ceo@demo.com / password123");
  console.log("  Manager:  manager@demo.com / password123");
  console.log("  Employee: employee@demo.com / password123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
