import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES, SUBSCRIPTION_STATUS } from "@quikit/shared";

/**
 * POST /api/org/subscription/upgrade
 *
 * Org-admin action that converts a trial (or lapsed) subscription into an
 * active paid plan. This is a STUB — real payment-provider integration is out
 * of scope. It flips the subscription to `active` so the trial gate releases
 * end-to-end and the chosen plan is recorded.
 *
 * Body: { orgId?, planSlug? }  (orgId defaults to the session org;
 *                               planSlug defaults to "growth")
 */
const Body = z.object({
  orgId: z.string().trim().optional(),
  planSlug: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const orgId = (parsed.data.orgId || session.user.orgId || "").trim();
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 });
  }

  // Only org admins (or super admins) may change billing.
  if (!isSuperAdmin) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    if (!member || !ADMIN_TIER_ROLES.has(member.role)) {
      return NextResponse.json(
        { success: false, error: "Org admin role required" },
        { status: 403 },
      );
    }
  }

  // Validate the requested plan (default to growth as the "Pro" plan).
  const planSlug = parsed.data.planSlug || "growth";
  const plan = await db.plan.findUnique({ where: { slug: planSlug }, select: { slug: true } });
  if (!plan) {
    return NextResponse.json({ success: false, error: "Unknown plan" }, { status: 422 });
  }

  // 30-day period as a placeholder until a payment provider drives billing cycles.
  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await db.subscription.upsert({
    where: { orgId },
    update: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      planSlug: plan.slug,
      trialEndsAt: null,
      currentPeriodEnd,
      source: "super_admin",
    },
    create: {
      orgId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      planSlug: plan.slug,
      currentPeriodEnd,
      source: "super_admin",
    },
  });

  // Keep Org.plan (legacy slug surface) in sync so existing reads stay correct.
  await db.org.update({ where: { id: orgId }, data: { plan: plan.slug } });

  return NextResponse.json({
    success: true,
    data: { status: subscription.status, planSlug: subscription.planSlug },
  });
}
