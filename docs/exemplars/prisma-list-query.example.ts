/**
 * Annotated reference: how to write a list query.
 *
 * The list-query shape is opinionated — every example query you'll write
 * looks like one of the patterns below. Copy the closest one, adapt fields.
 *
 * ⚠ Reference only. Not buildable from this directory.
 */
import { db } from "@/lib/db";
import { paginationToSkipTake, type PaginationParams } from "@quikit/shared";

/* ─── Pattern A — simple list ───────────────────────────────────────────────
 * Read N rows for an org, ordered, with a hard `take` cap. Use this 80% of
 * the time. `select` keeps the payload small and makes the contract explicit.
 */
export async function listWidgetsSimple(orgId: string) {
  return db.widget.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,           // ALWAYS cap. Unbounded findMany is a rejection.
  });
}

/* ─── Pattern B — list with filters + pagination ─────────────────────────────
 * Apply filters conditionally with the spread-on-truthy pattern. Pagination
 * goes through the shared utility — never roll your own skip/take.
 */
export async function listWidgetsFiltered(
  orgId: string,
  filters: { status?: string; ownerId?: string; search?: string },
  pagination: PaginationParams,
) {
  const where = {
    orgId,                          // never optional
    ...(filters.status && { status: filters.status }),
    ...(filters.ownerId && { ownerId: filters.ownerId }),
    ...(filters.search && {
      name: { contains: filters.search, mode: "insensitive" as const },
    }),
  };

  // Parallelize the count + fetch — they don't depend on each other.
  const [items, total] = await Promise.all([
    db.widget.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.widget.count({ where }),
  ]);

  return { items, total };
}

/* ─── Pattern C — list with related counts ─────────────────────────────────
 * Need "5 comments, 2 attachments" without loading them all? Use _count.
 * This adds zero relation rows to the payload — just a number per relation.
 */
export async function listWidgetsWithCounts(orgId: string) {
  return db.widget.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      _count: {
        select: { comments: true, attachments: true },
      },
    },
    take: 50,
  });
}

/* ─── Pattern D — list with one related parent ──────────────────────────────
 * Fetch a row + its parent in one round-trip via select-on-relation. Cheaper
 * than fetching them separately.
 */
export async function listWidgetsWithOwner(orgId: string) {
  return db.widget.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { name: "asc" },
    take: 50,
  });
}

/* ─── Anti-patterns — these get rejected ────────────────────────────────────
 *
 * ❌ findMany without `take`:
 *      db.widget.findMany({ where: { orgId } })
 *      // Could return millions of rows, blow memory.
 *
 * ❌ findMany without `orgId` filter:
 *      db.widget.findMany({ where: { status: "active" } })
 *      // Cross-org data leak. Critical security bug.
 *
 * ❌ `include` instead of `select` on lists:
 *      db.widget.findMany({ include: { owner: true, comments: true } })
 *      // Pulls every field of every relation. Payload bloat.
 *
 * ❌ Raw SQL with user input:
 *      db.$queryRawUnsafe(`SELECT * FROM widget WHERE name = '${search}'`)
 *      // SQL injection. Use Prisma's parameterized methods or $queryRaw with `Prisma.sql`.
 *
 * ❌ N+1 query inside .map:
 *      const widgets = await db.widget.findMany({ where: { orgId } });
 *      const enriched = await Promise.all(widgets.map(w => db.user.findUnique({ where: { id: w.ownerId } })));
 *      // Use `select: { owner: { select: ... } }` instead — one round trip.
 */
