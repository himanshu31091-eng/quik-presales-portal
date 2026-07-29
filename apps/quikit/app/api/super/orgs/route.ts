import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { createOrgSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";
import { sendOnboardingInvitationEmail } from "@/lib/email";
import { provisionAppRolesForOrg } from "@/lib/provisionAppRoles";
import { seedDefaultDisabledModuleFlags } from "@/lib/seedDefaultModuleFlags";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared/pagination";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLE_LABELS,
  MEMBERSHIP_ROLES,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * GET /api/super/orgs — list all tenants with pagination + search (super admin only)
 */
export const GET = withSuperAdminAuth(async (_auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);
    const search = searchParams.get("search") || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      db.org.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginationToSkipTake(pagination),
      }),
      db.org.count({ where }),
    ]);

    const data = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      status: t.status,
      memberCount: t._count.users,
      createdAt: t.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, ...buildPaginationResponse(data, total, pagination) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * POST /api/super/orgs — FRD FR-SA-001: create a new organization and (optionally)
 * invite the first Org Admin in a single transaction.
 *
 * Request shape:
 *   {
 *     name, slug?, plan?, billingEmail?, description?,
 *     appIds?: string[],          // FR-SA-002 — apps to provision
 *     admin?: {                   // FR-SA-003 — first Org Admin
 *       firstName, lastName, email,
 *       inviteMethod: "sso" | "native"
 *     }
 *   }
 *
 * Without `admin`: legacy single-org create (still supported).
 * With `admin`: org + OrgMember (status=invited) + provisioning of OrgAppAccess
 *               for each appId, plus an SSO/Native invitation email.
 */
export const POST = withSuperAdminAuth(async ({ userId }, request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = createOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { name, plan, billingEmail, description, appIds = [], admin } = parsed.data;
    const slug = parsed.data.slug ?? deriveSlug(name);

    // Normalise admin email at the boundary — DB queries (and the OAuth
    // signIn callback's lookup) treat email as lowercase. Storing the
    // original casing leads to mismatch when the same user later signs in
    // via OAuth, since OAuth returns email lowercased.
    if (admin) admin.email = admin.email.trim().toLowerCase();

    // FR-SA-004 — for SSO admin invites, the email must classify cleanly.
    // We check this BEFORE creating any rows so a bad email aborts the whole
    // transaction with a clean error instead of leaving an orphan org behind.
    // The async classifier resolves consumer domains synchronously and falls
    // back to an MX-record lookup for custom corporate domains, so we don't
    // have to maintain a hardcoded allow-list.
    let ssoProvider: SsoProvider | null = null;
    if (admin?.inviteMethod === INVITE_METHOD.SSO) {
      ssoProvider = await classifySsoProviderAsync(admin.email);
      if (!ssoProvider) {
        return NextResponse.json(
          { success: false, error: "SSO invitations require a Google or Microsoft email address." },
          { status: 422 }
        );
      }
    }

    // BRV-001 — slug must be unique across the platform.
    const existing = await db.org.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An organization with this slug already exists" },
        { status: 409 },
      );
    }

    // BRV-005 — when an admin block is provided, appIds must be non-empty AND
    // every selected appId must exist on the platform. Fetched up-front so
    // the error path doesn't create a half-baked org.
    let appsToProvision: { id: string; name: string; slug: string; baseUrl: string | null }[] = [];
    if (appIds.length > 0) {
      appsToProvision = await db.app.findMany({
        where: { id: { in: appIds }, status: "active" },
        select: { id: true, name: true, slug: true, baseUrl: true },
      });
      if (appsToProvision.length !== appIds.length) {
        return NextResponse.json(
          { success: false, error: "One or more selected applications are unavailable." },
          { status: 422 }
        );
      }
    }

    // ── Transaction: org + OrgAppAccess + OrgMember(invited) ────────────────
    const result = await db.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: { name, slug, plan, billingEmail, description, createdBy: userId },
      });

      // Provision app access for the org. Without this, FR-OA-002 ("App Admin
      // can only be assigned apps the org has access to") has nothing to
      // check against later. createMany honours skipDuplicates as a safety
      // belt — at this point the row set is fresh, but defensive.
      if (appsToProvision.length > 0) {
        await tx.orgAppAccess.createMany({
          data: appsToProvision.map((a) => ({
            orgId: org.id,
            appId: a.id,
            enabled: true,
          })),
          skipDuplicates: true,
        });

        // Persist each assigned app's "off by default" modules (e.g. QuikScale
        // Survey + Cash) as explicit per-org AppModuleFlag rows, so the disabled
        // state is stored organization-wise from initial setup. A super admin
        // can enable them later from App Feature Flags. No-op for apps without
        // any defaultDisabled modules.
        for (const a of appsToProvision) {
          await seedDefaultDisabledModuleFlags(tx, {
            orgId: org.id,
            appId: a.id,
            appSlug: a.slug,
            actorId: userId,
          });
        }
      }

      if (!admin) {
        return { org, membership: null, invitationToken: null };
      }

      // FR-SA-003 — first member is always Org Admin.
      const isNative = admin.inviteMethod === INVITE_METHOD.NATIVE;

      // Create or reuse the User. A native invite seeds a freshly-generated
      // friendly temp password and sets mustChangePassword=true so the
      // Set-Password screen fires on first login (FR-SA-009 / BR-008). SSO
      // users get no password.
      let adminUser = await tx.user.findUnique({ where: { email: admin.email } });
      let createdTempPassword: string | null = null;
      if (!adminUser) {
        if (isNative) createdTempPassword = generateTempPassword();
        adminUser = await tx.user.create({
          data: {
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            password:
              isNative && createdTempPassword
                ? await bcrypt.hash(createdTempPassword, 10)
                : null,
            mustChangePassword: isNative,
          },
        });
      }

      // BRV-010 — duplicate-membership guard. If the user is already a member
      // of this org somehow (race / shared user), we surface a 409 rather
      // than silently overwriting their existing role.
      const existingMembership = await tx.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: adminUser.id } },
      });
      if (existingMembership) {
        throw new DuplicateMembershipError(
          "This email is already associated with a member of this organisation."
        );
      }

      const invitationToken = crypto.randomUUID();
      const membership = await tx.orgMember.create({
        data: {
          orgId: org.id,
          userId: adminUser.id,
          role: MEMBERSHIP_ROLES.ORG_ADMIN,
          status: "invited",
          invitationToken,
          invitedAt: new Date(),
          inviteMethod: admin.inviteMethod,
          inviteProvider: ssoProvider,
          inviteAppIds: appIds,
          createdBy: userId,
        },
      });

      return {
        org,
        membership,
        invitationToken,
        adminUser,
        tempPassword: createdTempPassword,
        appNames: appsToProvision.map((a) => a.name),
      };
    });

    logAudit({
      action: "create",
      entityType: "tenant",
      entityId: result.org.id,
      actorId: userId,
      orgId: result.org.id,
      newValues: JSON.stringify({
        name,
        slug,
        plan,
        appIds,
        adminEmail: admin?.email ?? null,
        inviteMethod: admin?.inviteMethod ?? null,
      }),
    });

    // ── Seed per-app RBAC for every granted app ─────────────────────────────
    // For each app the org was granted, ask the app to seed its own
    // schema's AppRole / RolePermission tables and (if we just invited
    // an Org Admin) create a UserAppRole row linking that admin to the
    // seeded admin AppRole. Same wiring the QuikScale invite flow uses
    // when promoting the first admin of an org.
    //
    // Fire-and-forget. Per-app lazy seed on first login remains as the
    // fallback if the target app is briefly unreachable. Apps that
    // don't yet expose /api/internal/provision-roles are silently
    // skipped inside the helper.
    if (appsToProvision.length > 0) {
      const adminUserIds = result.adminUser ? [result.adminUser.id] : [];
      void provisionAppRolesForOrg(
        appsToProvision.map((a) => ({ slug: a.slug, baseUrl: a.baseUrl })),
        result.org.id,
        adminUserIds,
      );
    }

    // ── Send invitation email outside the transaction ───────────────────────
    // (Email is best-effort; if Resend/SMTP is down we don't want to roll
    // back the org. FRD §7 — 3 retries, then audit failure + warn the caller.)
    let emailWarning: string | null = null;
    if (result.membership && admin && result.invitationToken) {
      const inviter = await db.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const sendResult = await sendOnboardingInvitationEmail({
        to: admin.email,
        firstName: admin.firstName,
        orgName: result.org.name,
        orgLogoUrl: null,
        orgBrandColor: result.org.brandColor ?? null,
        inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "Quikit Admin",
        role: MEMBERSHIP_ROLE_LABELS[MEMBERSHIP_ROLES.ORG_ADMIN],
        appNames: result.appNames ?? [],
        token: result.invitationToken,
        inviteMethod: admin.inviteMethod,
        ssoProvider,
        tempPassword: result.tempPassword ?? "",
      });

      // Audit the email lifecycle event so the super-admin dashboard can
      // surface "delivery failed after 3 attempts" inline (FRD §7).
      logAudit({
        action: sendResult.success ? "invite_email_sent" : "invite_email_failed",
        entityType: "membership",
        entityId: result.membership.id,
        actorId: userId,
        orgId: result.org.id,
        newValues: JSON.stringify({
          to: admin.email,
          attempts: sendResult.attempts,
          error: sendResult.success ? undefined : String(sendResult.error ?? "unknown"),
        }),
      });

      if (!sendResult.success) {
        emailWarning = "Organisation created, but the invitation email could not be sent after 3 attempts. Use Resend Invite to retry.";
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          org: result.org,
          adminInvited: !!result.membership,
          // Plaintext temp password — shown ONCE in the super-admin UI when
          // the first Org Admin was invited via Native. Absent for SSO and
          // when no admin block was provided.
          tempPassword: result.tempPassword ?? undefined,
        },
        warning: emailWarning,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof DuplicateMembershipError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

class DuplicateMembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateMembershipError";
  }
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
