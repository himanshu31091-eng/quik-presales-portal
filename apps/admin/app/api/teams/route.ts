import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { teamSelect, formatTeam } from "@/lib/teams-helpers";
import { assignNamedRolesForAccess } from "@/lib/roles-helpers";

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
  // appSlugs are still accepted from the wizard for UX but team→app linking
  // requires the TeamApp model (deferred — see MIGRATION_NOTES.md). We grant
  // the same apps to each selected member via UserAppAccess instead.
  appSlugs: z.array(z.string()).min(1, "Select at least one app"),
  members: z
    .array(
      z.object({
        membershipId: z.string(),
        roles: z.record(z.string(), z.string()),
      }),
    )
    .optional()
    .default([]),
});

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "teams", orgId);
  if (blocked) return blocked as NextResponse;

  const teams = await db.team.findMany({
    where: { orgId },
    select: teamSelect(orgId),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: teams.map(formatTeam) });
});

export const POST = withAdminAuth(async ({ orgId, userId }, req) => {
  const blocked = await gateModuleApi("admin", "teams", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { name, appSlugs, members } = parsed.data;

  const base = slugify(name) || "team";
  const existing = await db.team.findMany({
    where: { orgId, slug: { startsWith: base } },
    select: { slug: true },
  });
  const existingSlugs = new Set(existing.map((t) => t.slug));
  let slug = base;
  let counter = 1;
  while (existingSlugs.has(slug)) slug = `${base}-${counter++}`;

  const membershipIds = members.map((m) => m.membershipId);
  const [memberships, apps] = await Promise.all([
    membershipIds.length > 0
      ? db.orgMember.findMany({
          where: { id: { in: membershipIds }, orgId },
          select: { id: true, userId: true },
        })
      : Promise.resolve([] as { id: string; userId: string }[]),
    db.app.findMany({
      where: { slug: { in: appSlugs } },
      select: { id: true, slug: true },
    }),
  ]);

  const membershipToUser = new Map(memberships.map((m) => [m.id, m.userId]));
  const slugToAppId = new Map(apps.map((a) => [a.slug, a.id]));

  const userTeamData: { orgId: string; userId: string; teamId: string }[] = [];
  const appAccessData: {
    userId: string;
    orgId: string;
    appId: string;
    role: string;
    grantedBy: string;
  }[] = [];

  for (const member of members) {
    const uid = membershipToUser.get(member.membershipId);
    if (!uid) continue;
    userTeamData.push({ orgId, userId: uid, teamId: "" });
    for (const [appSlug, role] of Object.entries(member.roles)) {
      const appId = slugToAppId.get(appSlug);
      if (appId) appAccessData.push({ userId: uid, orgId, appId, role, grantedBy: userId });
    }
  }

  const full = await db.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { orgId, name, slug, createdBy: userId },
    });

    if (userTeamData.length > 0) {
      await tx.userTeam.createMany({
        data: userTeamData.map((r) => ({ ...r, teamId: team.id })),
        skipDuplicates: true,
      });
    }

    if (appAccessData.length > 0) {
      await tx.userAppAccess.createMany({
        data: appAccessData,
        skipDuplicates: true,
      });
    }

    // Team→app linking pending TeamApp schema migration — see MIGRATION_NOTES.md.

    return tx.team.findUnique({ where: { id: team.id }, select: teamSelect(orgId) });
  });

  if (appAccessData.length > 0) {
    await assignNamedRolesForAccess(
      orgId,
      appAccessData.map((a) => ({ userId: a.userId, appId: a.appId, roleName: a.role })),
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, data: formatTeam(full!) }, { status: 201 });
});
