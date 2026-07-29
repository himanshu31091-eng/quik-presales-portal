import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { teamSelect, formatTeam } from "@/lib/teams-helpers";
import { assignNamedRolesForAccess } from "@/lib/roles-helpers";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  appSlugs: z.array(z.string()).optional(),
  members: z
    .array(z.object({ membershipId: z.string(), roles: z.record(z.string(), z.string()) }))
    .optional(),
});

/** Full team detail — includes membershipId per member so the edit modal can pre-populate. */
export const GET = withAdminAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", orgId);
  if (blocked) return blocked as NextResponse;

  const team = await db.team.findFirst({
    where: { id: params.id, orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      userTeams: {
        select: {
          userId: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              memberships: {
                where: { orgId },
                select: { id: true },
                take: 1,
              },
              appAccess: {
                where: { orgId },
                select: { role: true, app: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      color: team.color,
      // Team→app linking is pending TeamApp schema migration; see MIGRATION_NOTES.md.
      apps: [] as Array<{ slug: string; name: string }>,
      members: team.userTeams.map((m) => ({
        membershipId: m.user.memberships?.[0]?.id ?? "",
        name: `${m.user.firstName} ${m.user.lastName}`.replace(/ -$/, "").trim(),
        email: m.user.email,
        apps: m.user.appAccess.map((a) => ({ slug: a.app.slug, role: a.role })),
      })),
    },
  });
});

export const PATCH = withAdminAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
  }

  const team = await db.team.findFirst({ where: { id: params.id, orgId } });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  const { name, appSlugs, members } = parsed.data;

  let membershipToUser = new Map<string, string>();
  let slugToAppId = new Map<string, string>();

  if (members !== undefined || (appSlugs && appSlugs.length > 0)) {
    const membershipIds = (members ?? []).map((m) => m.membershipId);
    const [memberships, apps] = await Promise.all([
      membershipIds.length > 0
        ? db.orgMember.findMany({
            where: { id: { in: membershipIds }, orgId },
            select: { id: true, userId: true },
          })
        : Promise.resolve([] as { id: string; userId: string }[]),
      appSlugs && appSlugs.length > 0
        ? db.app.findMany({ where: { slug: { in: appSlugs } }, select: { id: true, slug: true } })
        : Promise.resolve([] as { id: string; slug: string }[]),
    ]);
    membershipToUser = new Map(memberships.map((m) => [m.id, m.userId]));
    slugToAppId = new Map(apps.map((a) => [a.slug, a.id]));
  }

  let appAccessRows: { userId: string; orgId: string; appId: string; role: string; grantedBy: string }[] = [];

  await db.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.team.update({
        where: { id: params.id },
        data: { name },
      });
    }

    // Team→app linking pending TeamApp schema migration.

    if (members !== undefined) {
      await tx.userTeam.deleteMany({ where: { teamId: params.id, orgId } });

      const userTeamRows = members
        .map((m) => ({ orgId, userId: membershipToUser.get(m.membershipId)!, teamId: params.id }))
        .filter((r) => r.userId);

      if (userTeamRows.length > 0) {
        await tx.userTeam.createMany({ data: userTeamRows, skipDuplicates: true });
      }

      appAccessRows = [];
      for (const m of members) {
        const uid = membershipToUser.get(m.membershipId);
        if (!uid) continue;
        for (const [appSlug, role] of Object.entries(m.roles)) {
          const appId = slugToAppId.get(appSlug);
          if (appId) appAccessRows.push({ userId: uid, orgId, appId, role, grantedBy: userId });
        }
      }
      if (appAccessRows.length > 0) {
        await tx.userAppAccess.createMany({ data: appAccessRows, skipDuplicates: true });
      }
    }
  });

  if (appAccessRows.length > 0) {
    await assignNamedRolesForAccess(
      orgId,
      appAccessRows.map((a) => ({ userId: a.userId, appId: a.appId, roleName: a.role })),
    ).catch(() => {});
  }

  const updated = await db.team.findUnique({
    where: { id: params.id },
    select: teamSelect(orgId),
  });

  return NextResponse.json({ success: true, data: formatTeam(updated!) });
});

export const DELETE = withAdminAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", orgId);
  if (blocked) return blocked as NextResponse;

  const team = await db.team.findFirst({ where: { id: params.id, orgId } });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  await db.$transaction([
    db.userTeam.deleteMany({ where: { teamId: params.id } }),
    db.team.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ success: true, data: null });
});
