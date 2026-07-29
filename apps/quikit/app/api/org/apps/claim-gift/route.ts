import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES, SURPRISE_GIFT_TRIAL_DAYS } from "@quikit/shared";

/**
 * POST /api/org/apps/claim-gift
 *
 * Claims the "surprise gift" promo offered on an app whose trial has expired.
 * Re-opens the trial by writing OrgAppAccess.trialEndsAt = now +
 * SURPRISE_GIFT_TRIAL_DAYS days (an extra month) — the same column the launcher
 * countdown reads, so the pill immediately reflects the extended trial.
 *
 * Body: { appSlug }
 *   - The gift length is server-authoritative (SURPRISE_GIFT_TRIAL_DAYS), never
 *     taken from the client.
 *   - Applies to every app the org has enabled.
 *
 * Org-admin (or super-admin) only — extending entitlements is an org-management
 * action, mirroring /api/org/apps/activate.
 */
const Body = z.object({
  appSlug: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const orgId = session.user.orgId;
    const isSuperAdmin = session.user.isSuperAdmin === true;
    if (!orgId) {
      return NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { appSlug } = parsed.data;

    // Org-admin gate (same policy as activation).
    if (!isSuperAdmin) {
      const member = await db.orgMember.findFirst({
        where: { userId, orgId, status: "active" },
        select: { role: true },
      });
      if (!member || !ADMIN_TIER_ROLES.has(member.role)) {
        return NextResponse.json(
          { success: false, error: "Org admin role required to claim this gift." },
          { status: 403 },
        );
      }
    }

    const app = await db.app.findUnique({
      where: { slug: appSlug },
      select: { id: true, slug: true, status: true },
    });
    if (!app || app.status === "disabled") {
      return NextResponse.json({ success: false, error: "Unknown or disabled app" }, { status: 404 });
    }

    // The app must already be provisioned for the org (the gift extends an
    // existing, expired trial — it doesn't grant access from nothing).
    const access = await db.orgAppAccess.findUnique({
      where: { orgId_appId: { orgId, appId: app.id } },
      select: { enabled: true },
    });
    if (!access || !access.enabled) {
      return NextResponse.json(
        { success: false, error: "This app is not active for your organisation." },
        { status: 404 },
      );
    }

    // Re-open the trial: extend by SURPRISE_GIFT_TRIAL_DAYS from now.
    const trialEndsAt = new Date(Date.now() + SURPRISE_GIFT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await db.orgAppAccess.update({
      where: { orgId_appId: { orgId, appId: app.id } },
      data: { enabled: true, trialEndsAt, updatedBy: userId },
    });

    return NextResponse.json({
      success: true,
      data: {
        appSlug: app.slug,
        trialDays: SURPRISE_GIFT_TRIAL_DAYS,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
