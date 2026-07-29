import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/org/subscription?orgId=…
 *
 * Returns the current subscription/trial state for an org the caller is an
 * active member of. Drives the launcher trial pill + upgrade UI.
 *
 * `state` semantics (single source of truth shared with verify-token):
 *   - grandfathered : no Subscription row → never gated (existing orgs)
 *   - active        : paid/active subscription
 *   - trialing      : free trial running (daysLeft > 0)
 *   - trial_expired : free trial lapsed
 *   - inactive      : past_due / canceled / expired paid plan
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const requestedOrgId = (req.nextUrl.searchParams.get("orgId") ?? "").trim();
  const isSuperAdmin = session.user.isSuperAdmin === true;

  // Resolve org: explicit ?orgId (validated below) > session org.
  const orgId = requestedOrgId || (session.user.orgId ?? "");
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 });
  }

  // Validate active membership (super admins may inspect any org).
  if (!isSuperAdmin) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "Not a member of this organisation" }, { status: 403 });
    }
  }

  const sub = await db.subscription.findUnique({
    where: { orgId },
    select: { status: true, planSlug: true, trialEndsAt: true, currentPeriodEnd: true },
  });

  const noStore = { headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0" } };

  // No row → grandfathered (existing orgs look exactly as before: no pill).
  if (!sub) {
    return NextResponse.json(
      { success: true, data: { state: "grandfathered", status: null, planSlug: null, trialEndsAt: null, daysLeft: null } },
      noStore,
    );
  }

  const now = Date.now();
  let state: "active" | "trialing" | "trial_expired" | "inactive";
  let daysLeft: number | null = null;

  if (sub.status === "active") {
    state = "active";
  } else if (sub.status === "trialing") {
    const ends = sub.trialEndsAt ? sub.trialEndsAt.getTime() : 0;
    if (ends > now) {
      state = "trialing";
      daysLeft = Math.max(1, Math.ceil((ends - now) / (24 * 60 * 60 * 1000)));
    } else {
      state = "trial_expired";
      daysLeft = 0;
    }
  } else {
    // past_due | canceled | expired
    state = sub.status === "expired" ? "trial_expired" : "inactive";
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        state,
        status: sub.status,
        planSlug: sub.planSlug,
        trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
        currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        daysLeft,
      },
    },
    noStore,
  );
}
