/**
 * SA-B.2 — Plan CRUD (read, update, delete by id).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth<{ id: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const plan = await db.plan.findUnique({ where: { id: params.id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }
    const tenantCount = await db.org.count({ where: { plan: plan.slug } });
    return NextResponse.json({ success: true, data: { ...plan, tenantCount } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load plan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const PATCH = withSuperAdminAuth<{ id: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const plan = await db.plan.findUnique({ where: { id: params.id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.description === "string") updates.description = body.description;
    if (Number.isFinite(body.priceMonthly)) updates.priceMonthly = Math.round(body.priceMonthly);
    if (Number.isFinite(body.priceYearly)) updates.priceYearly = Math.round(body.priceYearly);
    if (typeof body.currency === "string") updates.currency = body.currency;
    if (Array.isArray(body.features)) updates.features = body.features.filter((f: unknown) => typeof f === "string");
    if (body.limits !== undefined) updates.limits = body.limits ?? null;
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (Number.isFinite(body.sortOrder)) updates.sortOrder = Math.round(body.sortOrder);

    // slug intentionally not mutable — would break existing Tenant.plan refs
    if (body.slug && body.slug !== plan.slug) {
      return NextResponse.json({ success: false, error: "Plan slug cannot be changed" }, { status: 400 });
    }

    const updated = await db.plan.update({ where: { id: params.id }, data: updates });

    logAudit({
      actorId: auth.userId,
      action: "UPDATE",
      entityType: "Plan",
      entityId: plan.id,
      oldValues: JSON.stringify({
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        isActive: plan.isActive,
      }),
      newValues: JSON.stringify(updates),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update plan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const DELETE = withSuperAdminAuth<{ id: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const plan = await db.plan.findUnique({ where: { id: params.id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const inUse = await db.org.count({ where: { plan: plan.slug } });
    if (inUse > 0) {
      return NextResponse.json(
        { success: false, error: `Plan is still assigned to ${inUse} tenant${inUse === 1 ? "" : "s"}. Reassign before deleting.` },
        { status: 409 },
      );
    }

    await db.plan.delete({ where: { id: params.id } });

    logAudit({
      actorId: auth.userId,
      action: "DELETE",
      entityType: "Plan",
      entityId: plan.id,
      oldValues: JSON.stringify({ slug: plan.slug, name: plan.name }),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete plan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
