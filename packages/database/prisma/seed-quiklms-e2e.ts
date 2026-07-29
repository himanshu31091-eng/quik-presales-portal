/**
 * Idempotent E2E seeder for the QuikSkill LMS (apps/quiklms).
 *
 * Creates ONE isolated tenant plus one login-capable user per LmsUserRole, and
 * a full slice of domain data (courses → modules → lessons → assessment,
 * batch, exam, progress, assignments) so the E2E suite exercises real
 * behaviour instead of empty states.
 *
 * ── Why the dual-write ──────────────────────────────────────────────────────
 * Identity and LMS domain data live in two different schemas and a user needs
 * a row in BOTH to be testable:
 *   quikit.Org / auth.User / quikit.OrgMember / quikit.UserAppAccess  → session
 *   app_quiklms.tenants / app_quiklms.users                          → role
 * The platform folds Tenant onto Org (`LmsTenant.orgId` is @unique and the two
 * ids are kept equal), so we mint the Org first and reuse its id as the
 * tenant id. Seeding only one side yields a user who can hold a session but
 * resolves to no LMS role (403 everywhere) — which is exactly the gap that
 * made the pre-existing demo accounts untestable.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 * Every write is namespaced to the `quiklms-e2e` org / `e2e-*@quiklms.test`
 * emails. The wipe step deletes ONLY rows owned by that org. No other tenant's
 * data is read or written. Safe to re-run against a dev database.
 *
 * Usage:  npx tsx prisma/seed-quiklms-e2e.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const E2E = {
  ORG_SLUG: "quiklms-e2e",
  SUBDOMAIN: "quiklms-e2e",
  PASSWORD: "E2ETest123!",
  APP_SLUG: "quiklms",
  EMAIL_DOMAIN: "quiklms.test",
} as const;

/** One login-capable user per role. `orgMemberRole` is the PLATFORM role
 *  (quikit.OrgMember.role); `role` is the LMS role. They are distinct
 *  vocabularies and the mapping between them is what we want under test. */
const USERS = [
  { key: "superAdmin",  role: "SUPER_ADMIN",  orgMemberRole: "super_admin", isSuperAdmin: true,  firstName: "E2E", lastName: "SuperAdmin" },
  { key: "tenantAdmin", role: "TENANT_ADMIN", orgMemberRole: "org_admin",   isSuperAdmin: false, firstName: "E2E", lastName: "TenantAdmin" },
  { key: "subAdmin",    role: "SUB_ADMIN",    orgMemberRole: "member",      isSuperAdmin: false, firstName: "E2E", lastName: "SubAdmin" },
  { key: "manager",     role: "MANAGER",      orgMemberRole: "member",      isSuperAdmin: false, firstName: "E2E", lastName: "Manager" },
  { key: "teacher",     role: "TEACHER",      orgMemberRole: "member",      isSuperAdmin: false, firstName: "E2E", lastName: "Teacher" },
  { key: "parent",      role: "PARENT",       orgMemberRole: "member",      isSuperAdmin: false, firstName: "E2E", lastName: "Parent" },
  { key: "learner",     role: "LEARNER",      orgMemberRole: "member",      isSuperAdmin: false, firstName: "E2E", lastName: "Learner" },
] as const;

const emailFor = (key: string) => `e2e-${key.toLowerCase()}@${E2E.EMAIL_DOMAIN}`;

/** Delete every row this seeder owns, in FK-safe order. Scoped to one org. */
async function wipe(orgId: string) {
  const scope = { orgId };
  // Children first — these tables carry orgId directly.
  await prisma.lmsQuizAttempt.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsProgress.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsCourseAssignment.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsAssessment.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsExam.deleteMany({ where: scope }).catch(() => {});
  // Messaging/meeting/homework rows added for the wave-2 domain phases.
  // Participants and messages cascade from the conversation.
  await prisma.lmsConversation.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsMeeting.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsHomework.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsAttendance.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsScheduledClass.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsBatch.deleteMany({ where: scope }).catch(() => {});
  // Modules/lessons cascade from course.
  await prisma.lmsCourse.deleteMany({ where: scope }).catch(() => {});
  // Delete by email too: the SUPER_ADMIN row is deliberately tenant-less
  // (orgId null), so an orgId-scoped delete would leave it behind and the
  // next seed would collide on the identity-id primary key.
  await prisma.lmsUser.deleteMany({ where: scope }).catch(() => {});
  await prisma.lmsUser.deleteMany({
    where: { email: { in: USERS.map((u) => emailFor(u.key)) } },
  }).catch(() => {});
  await prisma.lmsTenant.deleteMany({ where: { orgId } }).catch(() => {});

  // Identity side.
  await prisma.userAppAccess.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.orgMember.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.orgAppAccess.deleteMany({ where: { orgId } }).catch(() => {});
  for (const u of USERS) {
    const email = emailFor(u.key);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    const others = await prisma.orgMember.count({ where: { userId: user.id } });
    if (others === 0) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: E2E.APP_SLUG } });
  if (!app) throw new Error(`App '${E2E.APP_SLUG}' not registered in quikit.App — cannot grant access.`);

  for (const slug of [E2E.ORG_SLUG, `${E2E.ORG_SLUG}-other`]) {
    const existing = await prisma.org.findUnique({ where: { slug } });
    if (!existing) continue;
    console.log(`🧹 Wiping previous E2E org '${slug}'...`);
    await wipe(existing.id);
    await prisma.org.delete({ where: { id: existing.id } }).catch(() => {});
  }
  // The victim tenant's admin is not in USERS, so wipe() misses it.
  await prisma.lmsUser.deleteMany({ where: { email: `e2e-other-admin@${E2E.EMAIL_DOMAIN}` } }).catch(() => {});
  const staleOther = await prisma.user.findUnique({ where: { email: `e2e-other-admin@${E2E.EMAIL_DOMAIN}` } });
  if (staleOther) await prisma.user.delete({ where: { id: staleOther.id } }).catch(() => {});

  console.log("🌱 Creating org + tenant...");
  const org = await prisma.org.create({
    data: {
      name: "QuikLMS E2E",
      slug: E2E.ORG_SLUG,
      description: "Automated E2E tenant for apps/quiklms — do not use manually",
      plan: "growth",
      status: "active",
    },
  });

  // Grant the org access to the quiklms app (org-level gate).
  await prisma.orgAppAccess.create({
    data: { orgId: org.id, appId: app.id, status: "active" },
  }).catch(() => {});

  // Tenant id === org id (orgId-native fold).
  await prisma.lmsTenant.create({
    data: {
      id: org.id,
      orgId: org.id,
      name: "QuikLMS E2E",
      subdomain: E2E.SUBDOMAIN,
      tenantKey: `e2e-${org.id.slice(0, 8)}`,
      orgName: "QuikLMS E2E",
      fullAddress: "1 Test Street, Test City",
      country: "IN",
      officialPhone: "+910000000000",
      officialEmail: `official@${E2E.EMAIL_DOMAIN}`,
      contactFirstName: "E2E",
      contactLastName: "Contact",
      contactPhone: "+910000000000",
      contactEmail: `contact@${E2E.EMAIL_DOMAIN}`,
      contactRoleInOrganization: "Admin",
      billingFirstName: "E2E",
      billingLastName: "Billing",
      billingAddress: "1 Test Street, Test City",
      timezone: "Asia/Kolkata",
      currency: "INR",
    },
  });

  console.log("👥 Creating users (identity + LMS dual-write)...");
  const hashed = await bcrypt.hash(E2E.PASSWORD, 10);
  const ids: Record<string, { userId: string; lmsUserId: string; email: string; role: string }> = {};

  for (const u of USERS) {
    const email = emailFor(u.key);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName: u.firstName,
        lastName: u.lastName,
        isSuperAdmin: u.isSuperAdmin,
        emailVerified: new Date(),
      },
    });
    await prisma.orgMember.create({
      data: { orgId: org.id, userId: user.id, role: u.orgMemberRole, status: "active", acceptedAt: new Date() },
    });
    await prisma.userAppAccess.create({
      data: { orgId: org.id, userId: user.id, appId: app.id, role: "member" },
    });
    const lmsUser = await prisma.lmsUser.create({
      data: {
        // MUST equal the identity user id: getAuthContext() resolves the LMS
        // role via `lmsUser.findUnique({ where: { id: session.id } })`. Email
        // is never used for resolution, so a mismatched id silently downgrades
        // the user to the coarse platform-role fallback (usually LEARNER).
        id: user.id,
        email,
        password: hashed,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role as never,
        // Global super-admins are deliberately tenant-less.
        orgId: u.role === "SUPER_ADMIN" ? null : org.id,
        isActive: true,
        mustChangePassword: false,
      },
    });
    ids[u.key] = { userId: user.id, lmsUserId: lmsUser.id, email, role: u.role };
  }

  console.log("📚 Creating courses / modules / lessons...");
  // Published course with 2 modules; module 1 has 3 lessons of mixed type and
  // an assessment, module 2 has 1 lesson. Gives the player, the progress
  // tracker and the quiz runner something real to walk.
  const published = await prisma.lmsCourse.create({
    data: {
      orgId: org.id,
      title: "E2E Published Course",
      category: "Testing",
      description: "Seeded course used by the E2E suite.",
      authorId: ids.tenantAdmin.lmsUserId,
      status: "Published" as never,
      modules: {
        create: [
          {
            orgId: org.id,
            title: "Module 1 — Basics",
            orderIndex: 0,
            lessons: {
              create: [
                { title: "Lesson 1 — Intro Video", type: "Video" as never, orderIndex: 0, duration: 5, contentUrl: "https://example.test/v.mp4" },
                { title: "Lesson 2 — Reading",     type: "Text" as never,  orderIndex: 1, duration: 3, description: "Some text content." },
                { title: "Lesson 3 — Handout",     type: "PDF" as never,   orderIndex: 2, duration: 4, contentUrl: "https://example.test/h.pdf" },
              ],
            },
          },
          {
            orgId: org.id,
            title: "Module 2 — Advanced",
            orderIndex: 1,
            lessons: { create: [{ title: "Lesson 4 — Wrap Up", type: "Text" as never, orderIndex: 0, duration: 2 }] },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true }, orderBy: { orderIndex: "asc" } } },
  });

  // A draft course — asserts learners must NOT see it.
  const draft = await prisma.lmsCourse.create({
    data: {
      orgId: org.id,
      title: "E2E Draft Course",
      category: "Testing",
      description: "Draft — must be invisible to learners.",
      authorId: ids.tenantAdmin.lmsUserId,
      status: "Draft" as never,
    },
  });

  const module1 = published.modules[0];
  const assessment = await prisma.lmsAssessment.create({
    data: {
      orgId: org.id,
      moduleId: module1.id,
      title: "Module 1 Quiz",
      passingScore: 50,
      retryLimit: 3,
      timeLimit: 10,
      questions: [
        { text: "2 + 2 = ?",        type: "multiple-choice", options: ["3", "4", "5"], correctAnswerIndex: 1 },
        { text: "Sky is green?",    type: "true-false",      options: ["True", "False"], correctAnswerIndex: 1 },
        { text: "Capital of India", type: "multiple-choice", options: ["Mumbai", "Delhi", "Pune"], correctAnswerIndex: 1 },
      ] as never,
    },
  });
  await prisma.lmsModule.update({ where: { id: module1.id }, data: { assessmentId: assessment.id } });

  console.log("🎓 Assigning course + seeding progress...");
  await prisma.lmsCourseAssignment.create({
    data: {
      orgId: org.id,
      courseId: published.id,
      targetType: "USER" as never,
      targetId: ids.learner.lmsUserId,
      isMandatory: true,
      assignedBy: ids.tenantAdmin.lmsUserId,
      dueDate: new Date(Date.now() + 30 * 864e5),
    },
  }).catch((e) => console.warn("  ! assignment skipped:", e.message.split("\n")[0]));

  await prisma.lmsProgress.create({
    data: {
      orgId: org.id,
      learnerId: ids.learner.lmsUserId,
      courseId: published.id,
      currentModuleId: module1.id,
      status: "InProgress" as never,
      completionPercentage: 25,
      lessonProgress: { [module1.lessons[0].id]: { completed: true, completedAt: new Date().toISOString() } } as never,
    },
  }).catch((e) => console.warn("  ! progress skipped:", e.message.split("\n")[0]));

  console.log("🏫 Creating batch + exam...");
  const batch = await prisma.lmsBatch.create({
    data: {
      orgId: org.id,
      name: "E2E Batch A",
      subject: "Testing",
      grade: "10",
      section: "A",
      teacherId: ids.teacher.lmsUserId,
      academicYear: "2026-2027",
      startDate: new Date(Date.now() - 7 * 864e5),
      endDate: new Date(Date.now() + 90 * 864e5),
      maxCapacity: 30,
      status: "active" as never,
      createdBy: ids.tenantAdmin.lmsUserId,
    },
  }).catch((e) => { console.warn("  ! batch skipped:", e.message.split("\n")[0]); return null; });

  if (batch) {
    await prisma.lmsExam.create({
      data: {
        orgId: org.id,
        createdBy: ids.teacher.lmsUserId,
        title: "E2E Midterm",
        description: "Seeded exam.",
        subject: "Testing",
        batchId: batch.id,
        duration: 60,
        totalMarks: 30,
        status: "published" as never,
        scheduledStartTime: new Date(Date.now() + 864e5),
        scheduledEndTime: new Date(Date.now() + 864e5 + 36e5),
      },
    }).catch((e) => console.warn("  ! exam skipped:", e.message.split("\n")[0]));
  }

  // ── Wave-2 domain data ────────────────────────────────────────────────────
  // Scheduling, meetings, homework and messaging account for ~50 API routes
  // between them. Without rows here those phases assert empty lists and pass
  // while exercising nothing, so each gets one realistic record.
  let scheduledClassId: string | null = null;
  let meetingId: string | null = null;
  let homeworkId: string | null = null;
  let conversationId: string | null = null;

  if (batch) {
    console.log("🗓️  Creating scheduled class / meeting / homework / conversation...");
    const cls = await prisma.lmsScheduledClass.create({
      data: {
        orgId: org.id,
        batchId: batch.id,
        teacherId: ids.teacher.lmsUserId,
        title: "E2E Class 1",
        startTime: new Date(Date.now() + 2 * 36e5),
        endTime: new Date(Date.now() + 3 * 36e5),
        status: "scheduled" as never,
      },
    }).catch((e) => { console.warn("  ! class skipped:", e.message.split("\n")[0]); return null; });
    scheduledClassId = cls?.id ?? null;

    const meeting = await prisma.lmsMeeting.create({
      data: {
        orgId: org.id,
        scheduledClassId: cls?.id ?? null,
        hostId: ids.teacher.lmsUserId,
        createdBy: ids.teacher.lmsUserId,
        provider: "jitsi" as never,
        joinUrl: "https://meet.jit.si/e2e-test-room",
        title: "E2E Meeting",
        scheduledStartTime: new Date(Date.now() + 2 * 36e5),
        scheduledEndTime: new Date(Date.now() + 3 * 36e5),
        status: "scheduled" as never,
      },
    }).catch((e) => { console.warn("  ! meeting skipped:", e.message.split("\n")[0]); return null; });
    meetingId = meeting?.id ?? null;

    const hw = await prisma.lmsHomework.create({
      data: {
        orgId: org.id,
        batchId: batch.id,
        teacherId: ids.teacher.lmsUserId,
        title: "E2E Homework 1",
        description: "Seeded homework.",
        dueDate: new Date(Date.now() + 7 * 864e5),
        assignedToStudentIds: [ids.learner.lmsUserId],
        maxScore: 100,
        status: "published" as never,
        publishedAt: new Date(),
      },
    }).catch((e) => { console.warn("  ! homework skipped:", e.message.split("\n")[0]); return null; });
    homeworkId = hw?.id ?? null;
  }

  // A direct conversation between teacher and learner, with one message, so
  // the 20 messaging routes have a real thread to act on.
  const convo = await prisma.lmsConversation.create({
    data: {
      orgId: org.id,
      type: "direct" as never,
      createdBy: ids.teacher.lmsUserId,
      messageCount: 1,
      lastMessageText: "Hello from the E2E seed.",
      lastMessageAt: new Date(),
      lastMessageBy: ids.teacher.lmsUserId,
      participants: {
        create: [
          { userId: ids.teacher.lmsUserId, role: "admin" as never },
          { userId: ids.learner.lmsUserId, role: "member" as never },
        ],
      },
      messages: {
        create: [{ senderId: ids.teacher.lmsUserId, text: "Hello from the E2E seed." }],
      },
    },
  }).catch((e) => { console.warn("  ! conversation skipped:", e.message.split("\n")[0]); return null; });
  conversationId = convo?.id ?? null;

  // ── Second tenant ─────────────────────────────────────────────────────────
  // Cross-tenant isolation is unprovable with a single org: every "leak" test
  // needs a resource that legitimately belongs to somebody else. This org is
  // the victim — the primary tenant's users must never see or mutate its rows.
  console.log("🏢 Creating second (victim) tenant for isolation tests...");
  const org2 = await prisma.org.create({
    data: { name: "QuikLMS E2E Other", slug: `${E2E.ORG_SLUG}-other`, plan: "growth", status: "active" },
  });
  await prisma.orgAppAccess.create({ data: { orgId: org2.id, appId: app.id, status: "active" } }).catch(() => {});
  await prisma.lmsTenant.create({
    data: {
      id: org2.id, orgId: org2.id,
      name: "QuikLMS E2E Other", subdomain: `${E2E.SUBDOMAIN}-other`,
      tenantKey: `e2e-other-${org2.id.slice(0, 8)}`,
      orgName: "QuikLMS E2E Other",
      fullAddress: "2 Other Street", country: "IN",
      officialPhone: "+910000000001", officialEmail: `official@other.${E2E.EMAIL_DOMAIN}`,
      contactFirstName: "Other", contactLastName: "Contact",
      contactPhone: "+910000000001", contactEmail: `contact@other.${E2E.EMAIL_DOMAIN}`,
      contactRoleInOrganization: "Admin",
      billingFirstName: "Other", billingLastName: "Billing", billingAddress: "2 Other Street",
      timezone: "Asia/Kolkata", currency: "INR",
    },
  });
  const otherAdminIdentity = await prisma.user.create({
    data: {
      email: `e2e-other-admin@${E2E.EMAIL_DOMAIN}`, password: hashed,
      firstName: "Other", lastName: "Admin", emailVerified: new Date(),
    },
  });
  await prisma.orgMember.create({
    data: { orgId: org2.id, userId: otherAdminIdentity.id, role: "org_admin", status: "active", acceptedAt: new Date() },
  });
  await prisma.userAppAccess.create({
    data: { orgId: org2.id, userId: otherAdminIdentity.id, appId: app.id, role: "member" },
  });
  await prisma.lmsUser.create({
    data: {
      id: otherAdminIdentity.id, email: otherAdminIdentity.email, password: hashed,
      firstName: "Other", lastName: "Admin", role: "TENANT_ADMIN" as never,
      orgId: org2.id, isActive: true, mustChangePassword: false,
    },
  });
  const otherCourse = await prisma.lmsCourse.create({
    data: {
      orgId: org2.id, title: "OTHER TENANT Course — must never leak",
      authorId: otherAdminIdentity.id, status: "Published" as never,
      description: "Belongs to the victim tenant.",
    },
  });

  const manifest = {
    orgId: org.id,
    tenantId: org.id,
    subdomain: E2E.SUBDOMAIN,
    password: E2E.PASSWORD,
    users: ids,
    courses: { published: published.id, draft: draft.id },
    modules: published.modules.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) })),
    assessmentId: assessment.id,
    batchId: batch?.id ?? null,
    scheduledClassId,
    meetingId,
    homeworkId,
    conversationId,
    other: {
      orgId: org2.id,
      tenantId: org2.id,
      adminUserId: otherAdminIdentity.id,
      adminEmail: otherAdminIdentity.email,
      courseId: otherCourse.id,
    },
  };

  const fs = await import("fs");
  const path = await import("path");
  const out = path.join(__dirname, "..", "..", "..", "apps", "quiklms", "__tests__", "e2e", ".seed-manifest.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));

  console.log("\n✅ Seed complete.");
  console.log(`   org/tenant id : ${org.id}`);
  console.log(`   users         : ${USERS.length} (password: ${E2E.PASSWORD})`);
  console.log(`   manifest      : ${out}`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
