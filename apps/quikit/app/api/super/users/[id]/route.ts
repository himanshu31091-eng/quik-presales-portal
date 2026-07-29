import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { updateUserSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";

/**
 * GET /api/super/users/[id] — user detail with memberships and app access (super admin only)
 */
export const GET = withSuperAdminAuth<{ id: string }>(async (auth, _request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        isSuperAdmin: true,
        lastSignInAt: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            org: {
              select: { id: true, name: true, slug: true, plan: true },
            },
          },
        },
        appAccess: {
          select: {
            id: true,
            role: true,
            app: {
              select: { id: true, name: true, slug: true },
            },
            org: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * PATCH /api/super/users/[id] — update a user (super admin only)
 */
export const PATCH = withSuperAdminAuth<{ id: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    // Build updateData from parsed fields (only include defined fields)
    const updateData: Record<string, unknown> = {};
    const { firstName, lastName, isSuperAdmin } = parsed.data;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (isSuperAdmin !== undefined) updateData.isSuperAdmin = isSuperAdmin;

    const user = await db.user.update({
      where: { id },
      data: updateData,
    });

    const action = isSuperAdmin !== undefined ? "toggle_super_admin" : "update";
    logAudit({
      action,
      entityType: "user",
      entityId: id,
      actorId: auth.userId,
      oldValues: JSON.stringify({ firstName: existing.firstName, lastName: existing.lastName, isSuperAdmin: existing.isSuperAdmin }),
      newValues: JSON.stringify(updateData),
    });

    // Tech-debt #20 close — when a user is demoted from super admin, revoke
    // any active impersonation tokens they created. Leaves accepted sessions
    // alone (those have their own expiresAt), but prevents the demoted admin
    // from redeeming any open tokens.
    if (isSuperAdmin === false && existing.isSuperAdmin === true) {
      const now = new Date();
      try {
        await db.impersonation.updateMany({
          where: { superAdminId: id, acceptedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        });
      } catch {
        // non-fatal — audit already written
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
