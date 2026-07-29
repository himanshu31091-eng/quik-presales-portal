import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";
import {
  directAddMemberSchema,
  updateMemberRoleSchema,
} from "@/lib/schemas/superAdminSchemas";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";
import { syncMemberRole } from "@/lib/memberRoleSync";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const ci = (contains: string): Prisma.StringFilter => ({
  contains,
  mode: "insensitive",
});

/**
 * Build the OrgMember `where` for a member search. Matches name tokens, email,
 * and the stored role string. Returns just the org filter when search is empty.
 */
function buildMemberSearchWhere(
  orgId: string,
  search: string,
): Prisma.OrgMemberWhereInput {
  if (!search) return { orgId };

  const tokens = search.split(/\s+/).filter(Boolean);
  const roleTerm = search.replace(/\s+/g, "_");

  const or: Prisma.OrgMemberWhereInput[] = [
    { user: { email: ci(search) } },
    { role: ci(roleTerm) },
  ];
  for (const token of tokens) {
    or.push({ user: { firstName: ci(token) } });
    or.push({ user: { lastName: ci(token) } });
  }

  return { orgId, OR: or };
}

/**
 * GET /api/super/orgs/[id]/members — paginated members for an org (super admin).
 *
 * The org-detail page uses this to page through every member of the org rather
 * than only the 10 most-recent rows returned by the org-detail endpoint.
 *
 * Query: ?page=1&limit=10&search=<name|email|role>
 *   - `search` matches (case-insensitive) against first name, last name, email
 *     and the stored role. Multi-word terms match name tokens independently
 *     ("Shakshi Jain" → first name "Shakshi" + last name "Jain"), and spaces
 *     in a role search are normalised to underscores ("org admin" → org_admin).
 */
export const GET = withSuperAdminAuth<{ id: string }>(
  async (_auth, request: NextRequest, { params }) => {
    try {
      const orgId = params.id;
      const pagination = parsePaginationParams(request.nextUrl.searchParams);
      const search = (request.nextUrl.searchParams.get("search") || "").trim();

      const where = buildMemberSearchWhere(orgId, search);

      const [members, total] = await Promise.all([
        db.orgMember.findMany({
          where,
          select: {
            id: true,
            role: true,
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          ...paginationToSkipTake(pagination),
        }),
        db.orgMember.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        ...buildPaginationResponse(members, total, pagination),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }
);

/**
 * FRD FR-SA-011 — direct-add member from the Superadmin org-detail panel.
 *
 * Skips the invitation-acceptance flow entirely: the member is created in
 * "active" status immediately and their per-app access is granted up-front via
 * `syncMemberRole` (Org Admin → admin on every provisioned app, Member →
 * baseline access). Two invite methods are supported:
 *
 *   - Native (default): a fresh User gets a system temp password + the
 *     "you've been added" email with credentials, and is routed through the
 *     Set-Password screen on first login (BR-008).
 *   - SSO: the email must classify as Google/Microsoft. The User is created
 *     passwordless and signs in via OAuth; the email carries a provider CTA
 *     with no credentials.
 *
 * Roles are limited to Org Admin and Member (product requirement). The orgId in
 * the URL takes precedence over any orgId in the body.
 *
 * Request: { email, firstName?, lastName?, role: "org_admin"|"member",
 *            inviteMethod?: "sso"|"native" }
 */
export const POST = withSuperAdminAuth<{ id: string }>(
  async ({ userId: adminUserId }, request: NextRequest, { params }) => {
    try {
      const orgId = params.id;
      const body = await request.json();

      const parsed = directAddMemberSchema.safeParse({ ...body, orgId });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
          { status: 400 }
        );
      }
      const { email, firstName, lastName, role, inviteMethod } = parsed.data;
      const isSso = inviteMethod === INVITE_METHOD.SSO;

      const org = await db.org.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      });
      if (!org) {
        return NextResponse.json(
          { success: false, error: "Organisation not found" },
          { status: 404 }
        );
      }

      // FR-SA-004 — SSO invites must resolve to a Google/Microsoft email.
      // Checked before any rows are written so a bad email aborts cleanly.
      let ssoProvider: SsoProvider | null = null;
      if (isSso) {
        ssoProvider = await classifySsoProviderAsync(email);
        if (!ssoProvider) {
          return NextResponse.json(
            { success: false, error: "SSO invitations require a Google or Microsoft email address." },
            { status: 422 }
          );
        }
      }

      // Look up the user; create with a freshly-generated temp password if new
      // and Native. SSO users are created passwordless. Plaintext is emailed
      // AND returned (new native users only) so the admin can show it once.
      let user = await db.user.findUnique({ where: { email } });
      let isNewUser = false;
      let tempPassword: string | null = null;
      if (!user) {
        if (!isSso) tempPassword = generateTempPassword();
        user = await db.user.create({
          data: {
            email,
            firstName,
            lastName,
            password: !isSso && tempPassword ? await bcrypt.hash(tempPassword, 10) : null,
            mustChangePassword: !isSso,
          },
        });
        isNewUser = true;
      }

      // BRV-010 — block duplicate active membership.
      const existing = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.id } },
      });
      if (existing && existing.status === "active") {
        return NextResponse.json(
          { success: false, error: "This email is already associated with a member of this organisation." },
          { status: 409 }
        );
      }

      const membership = await db.orgMember.upsert({
        where: { orgId_userId: { orgId, userId: user.id } },
        create: {
          orgId,
          userId: user.id,
          role,
          status: "active",
          inviteMethod,
          inviteProvider: ssoProvider,
          createdBy: adminUserId,
        },
        update: {
          role,
          status: "active",
          inviteMethod,
          inviteProvider: ssoProvider,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // Cascade the role to per-app access (UserAppAccess + per-app UserAppRole).
      // Org Admin → admin everywhere; Member → baseline access.
      await syncMemberRole(db, {
        orgId,
        userId: user.id,
        newRole: role,
        actorId: adminUserId,
      });

      logAudit({
        action: "add_member_direct",
        entityType: "membership",
        entityId: membership.id,
        actorId: adminUserId,
        orgId,
        newValues: JSON.stringify({ email, role, userId: user.id, inviteMethod }),
      });

      // Fire-and-forget welcome email. Temp password only for newly-created
      // native users; SSO and existing users never receive a password.
      const roleLabel =
        MEMBERSHIP_ROLE_LABELS[role as keyof typeof MEMBERSHIP_ROLE_LABELS] ?? role;
      sendMemberAddedEmail({
        to: user.email,
        orgName: org.name,
        role: roleLabel,
        inviteMethod,
        ssoProvider,
        tempPassword: isNewUser && !isSso && tempPassword ? tempPassword : undefined,
      }).catch((err) =>
        console.error("[email] Failed to send member added email:", user.email, err)
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            ...membership,
            // Plaintext temp password — shown ONCE in the super-admin UI.
            // Only present for newly created native users.
            tempPassword: isNewUser && !isSso && tempPassword ? tempPassword : undefined,
          },
        },
        { status: 201 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }
);

/**
 * Req 1 — change an existing member's org role (Org Admin ⇄ Member).
 *
 * Routes the change through `syncMemberRole` so it cascades to per-app admin
 * access. Guards against orphaning an org (last Org Admin) and refuses to
 * touch super-admin rows.
 *
 * Request: { userId, role: "org_admin"|"member" }
 */
export const PATCH = withSuperAdminAuth<{ id: string }>(
  async ({ userId: adminUserId }, request: NextRequest, { params }) => {
    try {
      const orgId = params.id;
      const parsed = updateMemberRoleSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
          { status: 400 }
        );
      }
      const { userId, role } = parsed.data;

      const membership = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId } },
        include: { user: { select: { email: true } } },
      });
      if (!membership) {
        return NextResponse.json(
          { success: false, error: "Member not found in this organisation." },
          { status: 404 }
        );
      }

      // Never let this endpoint mutate a platform super-admin membership.
      if (membership.role === MEMBERSHIP_ROLES.SUPER_ADMIN) {
        return NextResponse.json(
          { success: false, error: "A super admin's role cannot be changed here." },
          { status: 403 }
        );
      }

      // No-op shortcut.
      if (membership.role === role) {
        return NextResponse.json({ success: true, data: { userId, role } });
      }

      // Lockout guard — don't demote the org's only active Org Admin.
      if (
        membership.role === MEMBERSHIP_ROLES.ORG_ADMIN &&
        role === MEMBERSHIP_ROLES.MEMBER
      ) {
        const adminCount = await db.orgMember.count({
          where: { orgId, role: MEMBERSHIP_ROLES.ORG_ADMIN, status: "active" },
        });
        if (adminCount <= 1) {
          return NextResponse.json(
            { success: false, error: "Promote another member to Org Admin before demoting the last one." },
            { status: 409 }
          );
        }
      }

      await syncMemberRole(db, { orgId, userId, newRole: role, actorId: adminUserId });

      logAudit({
        action: "update_member_role",
        entityType: "membership",
        entityId: membership.id,
        actorId: adminUserId,
        orgId,
        oldValues: JSON.stringify({ role: membership.role }),
        newValues: JSON.stringify({ role }),
      });

      return NextResponse.json({ success: true, data: { userId, role } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }
);
