import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES, TRIAL_DURATION_DAYS, MEMBERSHIP_ROLES } from "@quikit/shared";
import { provisionAppRoles } from "@/lib/provisionAppRoles";
import { seedDefaultDisabledModuleFlags } from "@/lib/seedDefaultModuleFlags";
import { invalidateDisabledModules } from "@quikit/auth/feature-gate";

/**
 * POST /api/org/apps/activate
 *
 * Self-serve app activation from the launcher's "Other Tools" section. Starts
 * a 14-day per-app trial (OrgAppAccess.trialEndsAt = now + 14d), which moves
 * the app into the "Active" section. The Admin Portal is auto-activated
 * alongside the first app (with no trial — it's always free/included).
 *
 * Body: { appSlug, upgrade? }
 *   - upgrade=true converts the app to a paid/active state (trialEndsAt=null),
 *     releasing the trial gate. Real payment integration is out of scope.
 *
 * Org-admin (or super-admin) only — enabling apps is an org-management action.
 */
const Body = z.object({
  appSlug: z.string().trim().min(1),
  upgrade: z.boolean().optional(),
});

const ADMIN_PORTAL_SLUG = "admin";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const orgId = session.user.orgId;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const { appSlug, upgrade } = parsed.data;

  // Org-admin gate.
  if (!isSuperAdmin) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    if (!member || !ADMIN_TIER_ROLES.has(member.role)) {
      return NextResponse.json(
        { success: false, error: "Org admin role required to activate apps." },
        { status: 403 },
      );
    }
  }

  const app = await db.app.findUnique({
    where: { slug: appSlug },
    select: { id: true, slug: true, status: true, baseUrl: true },
  });
  if (!app || app.status === "disabled") {
    return NextResponse.json({ success: false, error: "Unknown or disabled app" }, { status: 404 });
  }

  // Trialing apps get a 14-day window; an upgrade (or the Admin Portal) has
  // no trial → trialEndsAt null → treated as active.
  const trialEndsAt = upgrade ? null : new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // Every Org Admin of this tenant is provisioned alongside the activation, so
  // a self-serve trial assigns the app + roles + permissions exactly the way a
  // super-admin assignment does (POST /api/super/org-app-access/:orgId and the
  // invitation-accept grant). The activating admin is always in this set.
  const adminMembers = await db.orgMember.findMany({
    where: { orgId, role: MEMBERSHIP_ROLES.ORG_ADMIN, status: "active" },
    select: { userId: true },
  });
  const adminUserIds = adminMembers.map((m) => m.userId);

  await db.orgAppAccess.upsert({
    where: { orgId_appId: { orgId, appId: app.id } },
    update: { enabled: true, trialEndsAt, updatedBy: userId },
    create: { orgId, appId: app.id, enabled: true, trialEndsAt, updatedBy: userId },
  });

  // 1. Per-user access (UserAppAccess) for every Org Admin. This is the record
  //    that populates the app's user-management list and the per-user role
  //    hint — mirrors the invitation-accept grant. Idempotent.
  if (adminUserIds.length > 0) {
    await db.userAppAccess.createMany({
      data: adminUserIds.map((uid) => ({
        userId: uid,
        orgId,
        appId: app.id,
        role: "admin",
        grantedBy: userId,
      })),
      skipDuplicates: true,
    });
  }

  // 2. Seed the app's own RBAC (AppRole / RolePermission) and bind every Org
  //    Admin to the seeded admin AppRole via UserAppRole. Fire-and-forget HTTP
  //    to the app's /api/internal/provision-roles; the app's lazy seed on
  //    first load remains the in-process fallback. Apps without a provision
  //    endpoint are silently skipped inside the helper.
  void provisionAppRoles({ slug: app.slug, baseUrl: app.baseUrl }, orgId, adminUserIds);

  // 3. Persist the app's "off by default" modules as explicit per-org rows and
  //    bust the module-gate cache — same as the super-admin grant.
  await seedDefaultDisabledModuleFlags(db, {
    orgId,
    appId: app.id,
    appSlug: app.slug,
    actorId: userId,
  });
  await invalidateDisabledModules(orgId, app.slug);

  // Auto-activate the Admin Portal alongside the first activated app (free —
  // no trial). Skip if the activated app IS the Admin Portal.
  if (app.slug !== ADMIN_PORTAL_SLUG) {
    const adminApp = await db.app.findUnique({
      where: { slug: ADMIN_PORTAL_SLUG },
      select: { id: true },
    });
    if (adminApp) {
      await db.orgAppAccess.upsert({
        where: { orgId_appId: { orgId, appId: adminApp.id } },
        update: { enabled: true },
        create: { orgId, appId: adminApp.id, enabled: true, trialEndsAt: null, updatedBy: userId },
      });
      // Grant the Org Admins per-user access to the Admin Portal too, so it
      // behaves like any other assigned app in their user list.
      if (adminUserIds.length > 0) {
        await db.userAppAccess.createMany({
          data: adminUserIds.map((uid) => ({
            userId: uid,
            orgId,
            appId: adminApp.id,
            role: "admin",
            grantedBy: userId,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { appSlug: app.slug, trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null },
  });
}
