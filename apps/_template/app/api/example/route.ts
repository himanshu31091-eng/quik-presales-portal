import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Canonical API route shape — copy this when adding new endpoints.
 *
 * Rules (enforced by reviewers + lint, see CLAUDE.md "API Route Pattern"):
 *   1. Wrap with `withOrgAuth` (or `requireAdmin`) — never trust the client.
 *   2. Validate input with Zod — never use raw `req.body`.
 *   3. Filter every Prisma query by tenantId.
 *   4. Use `select` for list endpoints; `include` only when you need the full model.
 *   5. Return `{ success: true, data }` or `{ success: false, error }` — same shape.
 *   6. Catch `(error: unknown)`, never `(e: any)`.
 *   7. POST returns 201 on creation; everything else returns 200.
 */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

/* GET — list example items for the current tenant */
export const GET = withOrgAuth(async ({ tenantId }) => {
  // Replace `widget` with your actual model. The tenantId filter is non-negotiable.
  const items = await db.widget.findMany({
    where: { tenantId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, data: items });
});

/* POST — create an example item */
export const POST = withOrgAuth(async ({ tenantId, userId }, req: NextRequest) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const widget = await db.widget.create({
    data: { ...parsed.data, tenantId, createdBy: userId },
    select: { id: true, name: true },
  });

  return NextResponse.json({ success: true, data: widget }, { status: 201 });
});
