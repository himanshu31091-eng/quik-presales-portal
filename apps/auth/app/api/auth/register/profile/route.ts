import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyJWT } from "@quikit/auth/jwt";
import { MEMBERSHIP_STATUS } from "@quikit/shared";
import { db } from "@/lib/db";

/**
 * POST /api/auth/register/profile — OPTIONAL onboarding step ("A few quick
 * details"), shown after Set-Password during self-serve registration.
 *
 * Every field is optional and the whole screen is skippable, so this endpoint
 * is best-effort: it persists whichever values were provided to the freshly
 * created workspace and the signed-in user, then the client redirects to the
 * launcher. It never gates access to /apps.
 *
 *   auth."User".jobRole         ← role
 *   quikit."Org".industry       ← industry
 *   quikit."Org".companySize    ← companySize
 *   quikit."Org".primaryUseCase ← primaryUseCase
 *
 * Auth: the caller must be signed in (the register flow establishes the
 * session via `signIn(redirect:false)` right before this step). We read the
 * user from the NextAuth JWT — same pattern as /api/auth/me/profile.
 */

// Kept in sync with the client option lists in app/register/page.tsx.
const INDUSTRIES = [
  "Technology / SaaS",
  "Finance & Banking",
  "Healthcare",
  "Retail & E-commerce",
  "Manufacturing",
  "Construction & Real Estate",
  "Education",
  "Professional Services",
  "Other",
] as const;
const ROLES = [
  "Founder / CEO",
  "Operations",
  "Product / Engineering",
  "Sales / Marketing",
  "HR / People",
  "Finance",
  "IT / Admin",
  "Other",
] as const;
const COMPANY_SIZES = [
  "1–10 employees",
  "11–50 employees",
  "51–200 employees",
  "201–1,000 employees",
  "1,000+ employees",
] as const;
const USE_CASES = [
  "CRM & sales",
  "Project & work management",
  "Team collaboration",
  "HR & people",
  "Analytics & reporting",
  "Customer support",
  "A bit of everything",
] as const;

// Empty string / null both mean "not provided" → normalise to undefined.
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : undefined));

const Body = z.object({
  industry: optionalEnum(INDUSTRIES),
  jobRole: optionalEnum(ROLES),
  companySize: optionalEnum(COMPANY_SIZES),
  primaryUseCase: optionalEnum(USE_CASES),
});

export async function POST(req: NextRequest) {
  try {
    const token = await verifyJWT(req);
    const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
    if (!token || !userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { industry, jobRole, companySize, primaryUseCase } = parsed.data;

    // The workspace the user just created — their active membership.
    const membership = await db.orgMember.findFirst({
      where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { orgId: true },
      orderBy: { createdAt: "desc" },
    });

    const orgData = {
      ...(industry !== undefined ? { industry } : {}),
      ...(companySize !== undefined ? { companySize } : {}),
      ...(primaryUseCase !== undefined ? { primaryUseCase } : {}),
    };

    await db.$transaction(async (tx) => {
      if (jobRole !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { jobRole } });
      }
      if (membership && Object.keys(orgData).length > 0) {
        await tx.org.update({ where: { id: membership.orgId }, data: orgData });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
