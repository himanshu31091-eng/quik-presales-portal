/**
 * SA-B.6 — Broadcast announcements CRUD (list + create).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

const VALID_SEVERITY = new Set(["info", "warning", "critical"]);

export const GET = withSuperAdminAuth(async () => {
  try {
    const rows = await db.broadcastAnnouncement.findMany({
      orderBy: { startsAt: "desc" },
      take: 100,
      include: { _count: { select: { dismissals: true } } },
    });
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        dismissalCount: r._count.dismissals,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load broadcasts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withSuperAdminAuth(async (auth, req: NextRequest) => {
  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body.trim() : "";
    const severity = VALID_SEVERITY.has(body.severity) ? body.severity : "info";
    const targetOrgIds = Array.isArray(body.targetOrgIds)
      ? body.targetOrgIds.filter((s: unknown) => typeof s === "string")
      : [];
    const targetAppSlugs = Array.isArray(body.targetAppSlugs)
      ? body.targetAppSlugs.filter((s: unknown) => typeof s === "string")
      : [];
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;

    if (!title || !bodyText) {
      return NextResponse.json({ success: false, error: "title and body are required" }, { status: 400 });
    }
    if (title.length > 120) {
      return NextResponse.json({ success: false, error: "title too long (max 120 chars)" }, { status: 400 });
    }
    if (endsAt && endsAt <= startsAt) {
      return NextResponse.json({ success: false, error: "endsAt must be after startsAt" }, { status: 400 });
    }

    const created = await db.broadcastAnnouncement.create({
      data: {
        title,
        body: bodyText,
        severity,
        targetOrgIds,
        targetAppSlugs,
        startsAt,
        endsAt,
        createdBy: auth.userId,
      },
    });

    logAudit({
      actorId: auth.userId,
      action: "CREATE",
      entityType: "BroadcastAnnouncement",
      entityId: created.id,
      newValues: JSON.stringify({ title, severity, targetOrgIds: targetOrgIds.length, targetAppSlugs: targetAppSlugs.length }),
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create broadcast";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
