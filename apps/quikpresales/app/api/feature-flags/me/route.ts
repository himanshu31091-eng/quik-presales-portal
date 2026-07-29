import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisabledModules } from "@quikit/auth/feature-gate";
import { cacheOrCompute } from "@quikit/shared/redisCache";

/**
 * GET /api/feature-flags/me
 *
 * Returns the set of disabled moduleKeys for the caller's org on THIS app.
 * The sidebar uses it to filter the nav tree. Safe to call freely — cached in
 * Redis for 5 minutes per (orgId, appSlug); Redis failures fall through to a
 * live read rather than erroring.
 *
 * Response: { success: true, data: { appSlug, disabledKeys: string[] } }
 */
const CACHE_TTL = 300; // seconds

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.orgId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const disabledKeys = await cacheOrCompute(
      `ff:me:quikpresales:${orgId}`,
      CACHE_TTL,
      async () => Array.from(await getDisabledModules(orgId, "quikpresales")),
    );

    return NextResponse.json({
      success: true,
      data: { appSlug: "quikpresales", disabledKeys },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
