import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_PLANS,
} from "@quikit/shared";

/**
 * POST /api/org/create — create an ADDITIONAL organisation for the currently
 * authenticated user (the "Create Organization" action in the launcher's
 * profile menu).
 *
 * This is the in-app, already-signed-in counterpart to the 3-step self-serve
 * registration flow (apps/auth: register → verify-otp → register/complete).
 * Because the caller is already authenticated (proven password + verified
 * email), there is NO OTP and NO password step — we provision the org in one
 * transaction and the client then switches into it via POST /api/org/select +
 * useSession().update().
 *
 * Mirrors the org-creation transaction in
 * apps/auth/app/api/auth/register/complete/route.ts, minus the user.update
 * (the logged-in user already has a password + emailVerified). Like that flow,
 * a brand-new workspace starts with ZERO activated apps — the user starts each
 * app's 14-day trial from the launcher's "Other Tools" section afterward.
 *
 * The caller becomes the org's org_admin. Name/email are NOT read from the
 * request body (the client shows them read-only) — email is sourced from the
 * DB user row so it can't be spoofed.
 */
const Body = z.object({
  // Same bounds as the self-serve register step (apps/auth register/route.ts).
  organizationName: z.string().trim().min(2).max(120),
});

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function uniqueOrgSlug(base: string): Promise<string> {
  const root = base || "workspace";
  let candidate = root;
  let n = 1;
  while (await db.org.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${root.slice(0, 47)}-${n}`;
  }
  return candidate;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { organizationName } = parsed.data;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Account not found. Please sign in again." },
        { status: 401 },
      );
    }

    const slug = await uniqueOrgSlug(deriveSlug(organizationName));

    const org = await db.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: {
          name: organizationName,
          slug,
          plan: TENANT_PLANS.STARTUP,
          billingEmail: user.email,
          createdBy: user.id,
        },
      });

      await tx.orgMember.create({
        data: {
          orgId: org.id,
          userId: user.id,
          role: MEMBERSHIP_ROLES.ORG_ADMIN,
          status: MEMBERSHIP_STATUS.ACTIVE,
          acceptedAt: new Date(),
          createdBy: user.id,
        },
      });

      await tx.subscription.create({
        data: {
          orgId: org.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          planSlug: TENANT_PLANS.STARTUP,
          // Distinct from register/complete's "self_serve_registration" so
          // analytics can tell in-app org creation apart from first signup.
          source: "self_serve_authenticated",
        },
      });

      return org;
    });

    return NextResponse.json(
      {
        success: true,
        data: { orgId: org.id, slug: org.slug, role: MEMBERSHIP_ROLES.ORG_ADMIN },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[org/create] failed:", error);
    const isDev = process.env.NODE_ENV !== "production";
    const message =
      isDev && error instanceof Error ? error.message : "Could not create the organisation.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
