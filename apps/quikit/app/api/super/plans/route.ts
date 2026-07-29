/**
 * SA-B.2 — Plan definitions CRUD (list + create).
 *
 * Replaces the hardcoded ["startup", "growth", "enterprise"] strings with
 * data the super admin can edit at runtime. Tenant.plan still stores the
 * slug — no FK enforced yet, so deleting a plan doesn't break existing
 * tenants; they just stop getting invoices until reassigned.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth(async () => {
  try {
    const plans = await db.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    });
    // Tenant counts per plan, for "plan in use" info
    const tenantCounts = await db.org.groupBy({
      by: ["plan"],
      _count: { plan: true },
    });
    const countMap = new Map(tenantCounts.map((c) => [c.plan, c._count.plan]));

    return NextResponse.json({
      success: true,
      data: plans.map((p) => ({
        ...p,
        priceMonthlyDollars: (p.priceMonthly / 100).toFixed(2),
        priceYearlyDollars: (p.priceYearly / 100).toFixed(2),
        tenantCount: countMap.get(p.slug) ?? 0,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load plans";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withSuperAdminAuth(async (auth, req: NextRequest) => {
  try {
    const body = await req.json();
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description : null;
    const priceMonthly = Number.isFinite(body.priceMonthly) ? Math.round(body.priceMonthly) : 0;
    const priceYearly = Number.isFinite(body.priceYearly) ? Math.round(body.priceYearly) : 0;
    const currency = typeof body.currency === "string" ? body.currency : "USD";
    const features = Array.isArray(body.features) ? body.features.filter((f: unknown) => typeof f === "string") : [];
    const limits = body.limits && typeof body.limits === "object" ? body.limits : null;
    const isActive = body.isActive !== false;
    const sortOrder = Number.isFinite(body.sortOrder) ? Math.round(body.sortOrder) : 0;

    if (!slug || !name) {
      return NextResponse.json({ success: false, error: "slug and name are required" }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{2,40}$/.test(slug)) {
      return NextResponse.json({ success: false, error: "slug must be 2-40 chars, [a-z0-9_-]" }, { status: 400 });
    }

    const existing = await db.plan.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Plan slug already exists" }, { status: 409 });
    }

    const plan = await db.plan.create({
      data: { slug, name, description, priceMonthly, priceYearly, currency, features, limits, isActive, sortOrder },
    });

    logAudit({
      actorId: auth.userId,
      action: "CREATE",
      entityType: "Plan",
      entityId: plan.id,
      newValues: JSON.stringify({ slug, name, priceMonthly, priceYearly }),
    });

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create plan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
