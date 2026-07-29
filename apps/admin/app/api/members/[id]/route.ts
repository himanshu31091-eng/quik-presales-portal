import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { invalidateMembershipCache, invalidateUserPermissionCache } from "@/lib/redis";
import { assignNamedRolesForAccess } from "@/lib/roles-helpers";

const patchSchema = z.object({
  appAccess: z.array(z.object({ appSlug: z.string(), role: z.string() })).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const DELETE = withAdminAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const membership = await db.orgMember.findFirst({
    where: { id: params.id, orgId },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Member not found" },
      { status: 404 },
    );
  }

  await db.$transaction([
    db.userAppAccess.deleteMany({ where: { userId: membership.userId, orgId } }),
    // db.userAppRole.deleteMany — pending schema migration; see MIGRATION_NOTES.md.
    db.orgMember.update({
      where: { id: params.id },
      data: { status: "inactive", invitationToken: null },
    }),
  ]);

  await Promise.all([
    invalidateMembershipCache(membership.userId, orgId),
    invalidateUserPermissionCache(orgId, membership.userId),
  ]);

  return NextResponse.json({ success: true, data: null });
});

export const PATCH = withAdminAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const membership = await db.orgMember.findFirst({
    where: { id: params.id, orgId },
    select: {
      id: true,
      userId: true,
      status: true,
      role: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          appAccess: {
            where: { orgId },
            select: { role: true, app: { select: { slug: true } } },
          },
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const { appAccess, status } = parsed.data;

  let newRoleAssignments: { userId: string; appId: string; roleName: string }[] = [];

  await db.$transaction(async (tx) => {
    if (status !== undefined) {
      await tx.orgMember.update({
        where: { id: params.id },
        data: { status },
      });
    }

    if (appAccess !== undefined) {
      await tx.userAppAccess.deleteMany({ where: { userId: membership.userId, orgId } });
      // tx.userAppRole.deleteMany pending schema migration; see MIGRATION_NOTES.md.

      if (appAccess.length > 0) {
        const apps = await tx.app.findMany({
          where: { slug: { in: appAccess.map((a) => a.appSlug) } },
          select: { id: true, slug: true },
        });
        await tx.userAppAccess.createMany({
          data: apps.map((app) => ({
            userId: membership.userId,
            orgId,
            appId: app.id,
            role: appAccess.find((a) => a.appSlug === app.slug)?.role ?? "member",
            grantedBy: userId,
          })),
          skipDuplicates: true,
        });

        newRoleAssignments = apps.map((app) => ({
          userId: membership.userId,
          appId: app.id,
          roleName: appAccess.find((a) => a.appSlug === app.slug)?.role ?? "",
        }));
      }
    }
  });

  if (newRoleAssignments.length > 0) {
    await assignNamedRolesForAccess(orgId, newRoleAssignments).catch(() => {});
  }

  await Promise.all([
    invalidateMembershipCache(membership.userId, orgId),
    invalidateUserPermissionCache(orgId, membership.userId),
  ]);

  const updatedStatus = status ?? (membership.status === "invited" ? "pending" : membership.status);
  const updatedApps = appAccess
    ? appAccess.map((a) => ({ slug: a.appSlug, role: a.role }))
    : membership.user.appAccess.map((a) => ({ slug: a.app.slug, role: a.role }));

  return NextResponse.json({
    success: true,
    data: {
      id: membership.id,
      name: `${membership.user.firstName} ${membership.user.lastName}`.replace(/ -$/, "").trim(),
      email: membership.user.email,
      avatar: membership.user.avatar ?? null,
      apps: updatedApps,
      role: membership.role,
      status: updatedStatus,
    },
  });
});
 