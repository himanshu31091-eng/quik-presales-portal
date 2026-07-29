import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consumeResetToken, consumePendingRegistration } from "@/lib/otp-store";
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_PLANS,
} from "@quikit/shared";

/**
 * POST /api/auth/register/complete — STEP 3 of self-serve workspace creation.
 *
 * Body: { resetToken, password }
 *
 * `resetToken` is the one-shot token minted by POST /api/auth/verify-otp after
 * a correct OTP. We consume it (single-use) to recover the userId, read the
 * pending org name out of Redis, then in one transaction: set the password +
 * mark the email verified, and provision Org + Org Admin membership + default
 * app access + a 14-day trial Subscription.
 */
const Body = z.object({
  resetToken: z.string().min(20),
  password: z.string().min(8).max(200),
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
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { resetToken, password } = parsed.data;

    const userId = await consumeResetToken(resetToken);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Your verification expired. Please start again." },
        { status: 400 },
      );
    }

    const pending = await consumePendingRegistration(userId);
    if (!pending) {
      return NextResponse.json(
        { success: false, error: "Your registration session expired. Please start again." },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Account not found. Please start again." },
        { status: 400 },
      );
    }

    const slug = await uniqueOrgSlug(deriveSlug(pending.organizationName));
    const hashed = await bcrypt.hash(password, 10);

    // A brand-new workspace starts with NO activated apps — the user picks
    // apps (each a 14-day per-app trial) from the launcher's "Other Tools"
    // section, so the "Active" section is empty on first open. The workspace
    // Subscription is created as `active` (the per-app trials, tracked on
    // OrgAppAccess.trialEndsAt, drive the trial UX — not this org-level row).
    const org = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashed, emailVerified: new Date() },
      });

      const org = await tx.org.create({
        data: {
          name: pending.organizationName,
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
          source: "self_serve_registration",
        },
      });

      return org;
    });

    return NextResponse.json(
      { success: true, userId: user.id, email: user.email, orgId: org.id, slug: org.slug },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[register/complete] failed:", error);
    const isDev = process.env.NODE_ENV !== "production";
    const message =
      isDev && error instanceof Error ? error.message : "Could not finish setting up your workspace.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
