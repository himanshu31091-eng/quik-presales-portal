import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendOnboardingInvitationEmail } from "@/lib/email";
import { assignNamedRolesForAccess } from "@/lib/roles-helpers";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLE_LABELS,
  MEMBERSHIP_ROLES,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";

const inviteSchema = z.object({
  name: z.string().min(2, "Full name is required").max(100),
  email: z.string().email("Invalid email address"),
  // Match the super-admin onboarding flow: caller picks SSO or Native.
  inviteMethod: z
    .enum([INVITE_METHOD.SSO, INVITE_METHOD.NATIVE])
    .default(INVITE_METHOD.SSO),
  // Membership role on the org. Defaults to "member" — the Org Admin who's
  // doing the inviting can promote to app_admin or org_admin if needed.
  role: z
    .enum([
      MEMBERSHIP_ROLES.MEMBER,
      MEMBERSHIP_ROLES.APP_ADMIN,
      MEMBERSHIP_ROLES.ORG_ADMIN,
    ])
    .default(MEMBERSHIP_ROLES.MEMBER),
  appAccess: z
    .array(z.object({ appSlug: z.string(), role: z.string() }))
    .optional()
    .default([]),
});

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const memberships = await db.orgMember.findMany({
    where: { orgId },
    select: {
      id: true,
      role: true,
      status: true,
      inviteMethod: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          appAccess: {
            where: { orgId },
            select: { appId: true, role: true, app: { select: { slug: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = memberships.map((m) => ({
    id: m.id,
    name: `${m.user.firstName} ${m.user.lastName}`.replace(/ -$/, "").trim(),
    email: m.user.email,
    avatar: m.user.avatar ?? null,
    apps: m.user.appAccess.map((a) => ({ slug: a.app.slug, role: a.role })),
    role: m.role,
    inviteMethod: m.inviteMethod ?? null,
    status: m.status === "invited" ? "pending" : m.status,
  }));

  return NextResponse.json({ success: true, data });
});

export const POST = withAdminAuth(async ({ orgId, userId }, req) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { name, email: rawEmail, appAccess, inviteMethod, role: memberRole } = parsed.data;
  const email = rawEmail.toLowerCase();
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ") || "-";
  const appSlugs = appAccess.map((a) => a.appSlug);
  const isNative = inviteMethod === INVITE_METHOD.NATIVE;

  // FR-SA-004 — for SSO invites, the email must classify as Google or
  // Microsoft (or MX-resolve to one). Reject up-front so we never persist
  // an invite that can't actually be accepted.
  let ssoProvider: SsoProvider | null = null;
  if (!isNative) {
    ssoProvider = await classifySsoProviderAsync(email);
    if (!ssoProvider) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SSO invitations require a Google or Microsoft email address. Switch to Native invite to use email + password.",
        },
        { status: 422 },
      );
    }
  }

  // FR-OA-002 — App Admin must be assigned at least one app.
  if (memberRole === MEMBERSHIP_ROLES.APP_ADMIN && appSlugs.length === 0) {
    return NextResponse.json(
      { success: false, error: "Select at least one application for the App Admin." },
      { status: 400 },
    );
  }

  const [org, existingUser] = await Promise.all([
    db.org.findUnique({ where: { id: orgId }, select: { name: true, brandColor: true } }),
    db.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, lastName: true, email: true, password: true },
    }),
  ]);
  if (!org) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  // Create the User if new. Native seeds with a freshly-generated friendly
  // temporary password + mustChangePassword so the Set-Password screen fires
  // on first login (FR-SA-009 / BR-008). SSO users get no password. The
  // plaintext is emailed to the invitee AND returned in this API response
  // so the inviting admin can display it once in their UI.
  let user = existingUser;
  let tempPassword: string | null = null;
  if (isNative) {
    tempPassword = generateTempPassword();
  }
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: isNative && tempPassword ? await bcrypt.hash(tempPassword, 10) : null,
        mustChangePassword: isNative,
      },
      select: { id: true, firstName: true, lastName: true, email: true, password: true },
    });
  } else if (isNative && !user.password && tempPassword) {
    // Existing user re-invited via native flow with no password yet — seed
    // the freshly-generated temp password so they can complete the
    // Set-Password screen.
    await db.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
      },
    });
  } else if (isNative && user.password) {
    // Existing user with a password — don't overwrite. Drop the temp
    // password so it isn't surfaced or emailed.
    tempPassword = null;
  }

  // Resolve appIds in parallel with the duplicate-membership check.
  const [existingMembership, apps] = await Promise.all([
    db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } }),
    appSlugs.length > 0
      ? db.app.findMany({
          where: { slug: { in: appSlugs } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as { id: string; slug: string; name: string }[]),
  ]);

  if (existingMembership && existingMembership.status !== "inactive") {
    return NextResponse.json(
      { success: false, error: "This user is already a member of your organisation" },
      { status: 409 },
    );
  }

  // BRV-005 — selected apps must be provisioned for this org (matches what
  // the super-admin direct-add enforces on its end).
  if (apps.length > 0) {
    const provisioned = await db.orgAppAccess.findMany({
      where: { orgId, appId: { in: apps.map((a) => a.id) }, enabled: true },
      select: { appId: true },
    });
    const provisionedIds = new Set(provisioned.map((p) => p.appId));
    const missing = apps.filter((a) => !provisionedIds.has(a.id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Apps not provisioned for this organisation: ${missing.map((a) => a.slug).join(", ")}`,
        },
        { status: 422 },
      );
    }
  }

  const invitationToken = randomBytes(32).toString("hex");
  const appIdList = apps.map((a) => a.id);

  const membership = await db.$transaction(async (tx) => {
    // Re-invite a previously removed member: reset the existing row instead
    // of creating a duplicate. Carry the new inviteMethod + provider.
    const m = existingMembership
      ? await tx.orgMember.update({
          where: { id: existingMembership.id },
          data: {
            role: memberRole,
            status: "invited",
            invitationToken,
            invitedAt: new Date(),
            acceptedAt: null,
            inviteMethod,
            inviteProvider: ssoProvider,
            inviteAppIds: appIdList,
            createdBy: userId,
          },
        })
      : await tx.orgMember.create({
          data: {
            orgId,
            userId: user.id,
            role: memberRole,
            status: "invited",
            invitationToken,
            invitedAt: new Date(),
            inviteMethod,
            inviteProvider: ssoProvider,
            inviteAppIds: appIdList,
            createdBy: userId,
          },
        });

    if (apps.length > 0) {
      // App Admin's per-app role is "admin"; everyone else is "member".
      const userAppRoleDefault =
        memberRole === MEMBERSHIP_ROLES.APP_ADMIN ? "admin" : "member";
      await tx.userAppAccess.createMany({
        data: apps.map((app) => ({
          userId: user.id,
          orgId,
          appId: app.id,
          role:
            appAccess.find((a) => a.appSlug === app.slug)?.role ?? userAppRoleDefault,
          grantedBy: userId,
        })),
        skipDuplicates: true,
      });
    }

    return m;
  });

  if (apps.length > 0) {
    await assignNamedRolesForAccess(
      orgId,
      apps.map((app) => ({
        userId: user.id,
        appId: app.id,
        roleName: appAccess.find((a) => a.appSlug === app.slug)?.role ?? "",
      })),
    ).catch(() => {});
  }

  // Resolve inviter name for the email body (best-effort).
  const inviter = await db.user
    .findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    })
    .catch(() => null);
  const inviterName = inviter
    ? `${inviter.firstName} ${inviter.lastName}`.trim() || inviter.email
    : "QuikIT Admin";

  // Send the canonical SSO / Native onboarding email. Best-effort — never
  // fails the API on email errors.
  const roleLabel = MEMBERSHIP_ROLE_LABELS[memberRole] ?? String(memberRole);
  try {
    const result = await sendOnboardingInvitationEmail({
      to: email,
      firstName,
      orgName: org.name,
      orgLogoUrl: null,
      orgBrandColor: org.brandColor ?? null,
      inviterName,
      role: roleLabel,
      appNames: apps.map((a) => a.name),
      token: invitationToken,
      inviteMethod,
      ssoProvider,
      tempPassword: tempPassword ?? "",
    });
    if (!result.success) {
      console.error(
        "[invite email] delivery failed after",
        result.attempts,
        "attempts:",
        result.error,
      );
    }
  } catch (err) {
    console.error("[invite email] threw:", err);
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: membership.id,
        name: `${user.firstName} ${user.lastName}`.replace(/ -$/, "").trim(),
        email: user.email,
        avatar: null,
        apps: appAccess.map((a) => ({ slug: a.appSlug, role: a.role })),
        role: membership.role,
        inviteMethod,
        ssoProvider,
        status: "pending",
        // Plaintext temp password — shown ONCE in the admin UI so the
        // inviting admin can relay it manually if email delivery is delayed.
        // Only present for native invites where we actually generated one.
        tempPassword: tempPassword ?? undefined,
      },
    },
    { status: 201 },
  );
});
