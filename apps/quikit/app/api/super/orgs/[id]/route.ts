import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { updateOrgSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";
import { sendOrgSuspendedEmail } from "@/lib/email";

/**
 * GET /api/super/orgs/[id] — org detail with counts and recent members (super admin only)
 */
export const GET = withSuperAdminAuth<{ id: string }>(async (_auth, _request, { params }) => {
  try {
    const { id } = params;

    const org = await db.org.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, teams: true, userAppAccess: true } },
        users: {
          take: 10,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: org });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * PATCH /api/super/orgs/[id] — update an organization (super admin only)
 */
export const PATCH = withSuperAdminAuth<{ id: string }>(async ({ userId }, request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const body = await request.json();
    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const existing = await db.org.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    // Build updateData from parsed fields (only include defined fields)
    const updateData: Record<string, unknown> = {};
    const { name, plan, status, billingEmail, description } = parsed.data;
    if (name !== undefined) updateData.name = name;
    if (plan !== undefined) updateData.plan = plan;
    if (status !== undefined) updateData.status = status;
    if (billingEmail !== undefined) updateData.billingEmail = billingEmail;
    if (description !== undefined) updateData.description = description;

    const org = await db.org.update({
      where: { id },
      data: updateData,
    });

    logAudit({
      action: "update",
      entityType: "tenant",
      entityId: id,
      actorId: userId,
      orgId: id,
      oldValues: JSON.stringify({ name: existing.name, plan: existing.plan, status: existing.status }),
      newValues: JSON.stringify(updateData),
    });

    return NextResponse.json({ success: true, data: org });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * DELETE /api/super/orgs/[id] — suspend an organization (super admin only)
 */
export const DELETE = withSuperAdminAuth<{ id: string }>(async ({ userId }, _request, { params }) => {
  try {
    const { id } = params;

    const existing = await db.org.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    await db.org.update({
      where: { id },
      data: { status: "suspended" },
    });

    logAudit({
      action: "suspend",
      entityType: "tenant",
      entityId: id,
      actorId: userId,
      orgId: id,
      oldValues: JSON.stringify({ status: existing.status }),
      newValues: JSON.stringify({ status: "suspended" }),
    });

    // Fire-and-forget: notify org admins about suspension
    db.orgMember.findMany({
      where: { orgId: id, role: { in: ["owner", "admin"] }, status: "active" },
      include: { user: { select: { email: true } } },
    }).then((members) => {
      for (const m of members) {
        sendOrgSuspendedEmail({ to: m.user.email, orgName: existing.name }).catch((err) =>
          console.error("[email] Failed to send org suspended email:", m.user.email, err)
        );
      }
    }).catch((err) => console.error("[email] Failed to fetch org admins for suspension notice:", err));

    return NextResponse.json({ success: true, message: "Organization suspended" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
