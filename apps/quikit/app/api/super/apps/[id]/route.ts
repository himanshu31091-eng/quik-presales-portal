import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { updateAppSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";

/**
 * GET /api/super/apps/[id] — app detail with OAuth client info (super admin only)
 */
export const GET = withSuperAdminAuth<{ id: string }>(async (auth, _request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const app = await db.app.findUnique({
      where: { id },
      include: {
        oauthClient: {
          select: {
            id: true,
            clientId: true,
            redirectUris: true,
            scopes: true,
            grantTypes: true,
            createdAt: true,
          },
        },
        _count: { select: { userAccess: true } },
      },
    });

    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: app });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * PATCH /api/super/apps/[id] — update an app (super admin only)
 */
export const PATCH = withSuperAdminAuth<{ id: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const body = await request.json();
    const parsed = updateAppSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const existing = await db.app.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    // Build updateData from parsed fields (only include defined fields)
    const updateData: Record<string, unknown> = {};
    const { name, description, baseUrl, status } = parsed.data;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (status !== undefined) updateData.status = status;

    const app = await db.app.update({
      where: { id },
      data: updateData,
    });

    logAudit({
      action: "update",
      entityType: "app",
      entityId: id,
      actorId: auth.userId,
      oldValues: JSON.stringify({ name: existing.name, status: existing.status }),
      newValues: JSON.stringify(updateData),
    });

    return NextResponse.json({ success: true, data: app });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * DELETE /api/super/apps/[id] — disable an app (super admin only)
 */
export const DELETE = withSuperAdminAuth<{ id: string }>(async (auth, _request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const existing = await db.app.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    await db.app.update({
      where: { id },
      data: { status: "disabled" },
    });

    logAudit({
      action: "disable",
      entityType: "app",
      entityId: id,
      actorId: auth.userId,
      oldValues: JSON.stringify({ status: existing.status }),
      newValues: JSON.stringify({ status: "disabled" }),
    });

    return NextResponse.json({ success: true, message: "App disabled" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
