import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/plans
 *
 * Lists active subscription plans for any authenticated user (org admins must
 * see pricing to upgrade). This is intentionally NOT super-admin gated — that
 * stays on /api/super/plans, which manages the plan catalog.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const plans = await db.plan.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      name: true,
      description: true,
      priceMonthly: true,
      priceYearly: true,
      currency: true,
      features: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    { success: true, data: plans },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
