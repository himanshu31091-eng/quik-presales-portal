/**
 * Annotated reference: a complete API route covering GET (list) + POST (create).
 *
 * Copy this file into your app at `app/api/<resource>/route.ts` and rename
 * `Widget` to your domain model. Every comment below explains a non-obvious
 * choice — read them all before deleting.
 *
 * ⚠ This file lives under `docs/exemplars/` to be educational, not buildable.
 *    It imports paths that exist *in apps* (e.g. `@/lib/db`), which won't
 *    resolve from this directory. Don't add docs/ to your tsconfig include.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared";

/* ─── Input schemas ─────────────────────────────────────────────────────────
 * Zod schemas live at the top of the route file. One schema per HTTP verb.
 * Keep schemas narrow — accept only what you'll actually persist. Casts like
 * `.toLowerCase()` are fine here; complex normalization belongs in helpers.
 */
const listQuerySchema = z.object({
  status: z.enum(["draft", "active", "completed"]).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "completed"]).default("draft"),
});

/* ─── GET /api/widgets ──────────────────────────────────────────────────────
 * List widgets for the current org. Paginated. Filterable.
 *
 * Auth: withOrgAuth. Injects { session, userId, orgId } from session, returns
 *       401 (no session) / 403 (no active membership) automatically.
 */
export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  // 1. Validate query string. Object.fromEntries works because URLSearchParams
  //    iterator yields [key, value] pairs.
  const parsedQuery = listQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      { success: false, error: parsedQuery.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  // 2. Build the where clause. orgId is non-negotiable — every other filter
  //    is conditional. The spread-on-truthy pattern keeps the where clean.
  const { status, search } = parsedQuery.data;
  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where = {
    orgId,
    ...(status && { status }),
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  // 3. Fetch list + count in parallel. Use `select` (not `include`) for lists
  //    so the JSON payload stays small. Re-add fields when consumers actually
  //    need them — never speculatively.
  const [items, total] = await Promise.all([
    db.widget.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.widget.count({ where }),
  ]);

  // 4. Wrap in the canonical pagination response shape. Don't invent your own.
  return NextResponse.json({
    success: true,
    data: buildPaginationResponse(items, total, pagination),
  });
});

/* ─── POST /api/widgets ─────────────────────────────────────────────────────
 * Create a new widget. Body: { name, description?, status }.
 *
 * Returns 201 on success (per HTTP convention for resource creation).
 * Writes an audit log entry — required for every mutation.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    // 1. Parse + validate body. Cast to unknown first if you ever need to
    //    pre-process; never `as any`.
    const body = (await req.json()) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    // 2. Create + audit in a single transaction. If audit fails, the create
    //    rolls back. This avoids "ghost" rows with no audit trail.
    const widget = await db.$transaction(async (tx) => {
      const created = await tx.widget.create({
        data: { ...parsed.data, orgId, createdBy: userId },
        select: { id: true, name: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: "CREATE",
          entityType: "Widget",
          entityId: created.id,
          changes: Object.keys(parsed.data),
          reason: `Created widget "${created.name}"`,
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: widget }, { status: 201 });
  } catch (error: unknown) {
    // 3. Catch unknown — never `e: any`. Use `instanceof Error` for `.message`.
    //    Don't leak stack traces — the message goes to the user.
    const message = error instanceof Error ? error.message : "Failed to create widget";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/* Things you DON'T see in this example, on purpose:
 * - No PUT — for partial updates use PATCH; full-replace is rare in CRUD apps.
 * - No DELETE — soft delete is preferred; design with the integration owner.
 * - No `include` for nested relations on list endpoints — bloats payload.
 * - No raw `req.body` reads — always Zod-validate.
 * - No orgId from query parameters — always from session (the wrapper resolves it).
 * - No string concatenation in queries — Prisma is parameterized.
 *
 * If you find yourself needing any of those, talk to the integration owner
 * before shipping.
 */
