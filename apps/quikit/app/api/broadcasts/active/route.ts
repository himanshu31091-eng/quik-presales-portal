/**
 * SA-B.6 — Active broadcasts for the current user (tenant-scoped).
 *
 * Returns a list of BroadcastAnnouncement rows that:
 *   - Are in their time window (startsAt <= now <= endsAt || endsAt null)
 *   - Target this tenant (or are platform-wide — empty targetOrgIds)
 *   - Optionally target this app slug (or are cross-app — empty targetAppSlugs)
 *   - Have NOT been dismissed by this user
 *
 * Called from an app's layout by the BroadcastBanner component.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, data: [] });
    }
    const userId = session.user.id;
    const orgId = session.user.orgId ?? null;
    const appSlug = req.nextUrl.searchParams.get("app");

    const now = new Date();
    const all = await db.broadcastAnnouncement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: "desc" },
      take: 20,
    });

    // Filter targeting + dismissals in memory — at current scale this is
    // cheaper than adding a complex SQL join.
    const applicable = all.filter((a) => {
      if (a.targetOrgIds.length > 0 && (!orgId || !a.targetOrgIds.includes(orgId))) {
        return false;
      }
      if (appSlug && a.targetAppSlugs.length > 0 && !a.targetAppSlugs.includes(appSlug)) {
        return false;
      }
      return true;
    });

    const dismissals = applicable.length
      ? await db.broadcastDismissal.findMany({
          where: { userId, announcementId: { in: applicable.map((a) => a.id) } },
          select: { announcementId: true },
        })
      : [];
    const dismissedSet = new Set(dismissals.map((d) => d.announcementId));

    const active = applicable.filter((a) => !dismissedSet.has(a.id));

    return NextResponse.json({
      success: true,
      data: active.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        severity: a.severity,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt?.toISOString() ?? null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load broadcasts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
