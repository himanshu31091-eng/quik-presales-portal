import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/get-user-id-from-request";

/**
 * GET /api/org/memberships — list all orgs the logged-in user belongs to.
 * Used by the launcher /apps org switcher.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db.orgMember.findMany({
      where: { userId, status: "active" },
      select: { orgId: true, role: true },
    });

    const orgIds = [...new Set(rows.map((r) => r.orgId))];
    const tenants =
      orgIds.length === 0
        ? []
        : await db.org.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, slug: true },
          });

    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const orgs = rows
      .map((m) => {
        const t = tenantById.get(m.orgId);
        if (!t) return null;
        return {
          orgId: t.id,
          orgName: t.name,
          orgSlug: t.slug,
          role: m.role,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);

    return NextResponse.json({ success: true, orgs });
  } catch (err) {
    console.error("[GET /api/org/memberships]", err);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" && err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
