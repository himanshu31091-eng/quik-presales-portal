import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { DEMO_STATUSES } from "@/lib/library/constants";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withDemoAuth = withOrgAuthForModule("library.demos");

const listQuery = z.object({
  industry: z.string().max(80).optional(),
  technology: z.string().max(80).optional(),
  status: z.enum(DEMO_STATUSES).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  industry: z.string().min(1, "Industry is required").max(80),
  technology: z.string().min(1, "Technology is required").max(80),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(4000).optional(),
  blobUrl: z.string().url().optional(),
  recordingUrl: z.string().url().optional(),
  scriptDocId: z.string().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

const LIST_SELECT = {
  id: true,
  industry: true,
  technology: true,
  title: true,
  description: true,
  blobUrl: true,
  recordingUrl: true,
  status: true,
  feedbackScore: true,
  feedbackCount: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PsDemoSelect;

/** GET /api/demos — the demo library grid, filterable by industry × technology. */
export const GET = withDemoAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "demos", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { industry, technology, status, search } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsDemoWhereInput = {
    orgId,
    deletedAt: null,
    ...(industry && { industry }),
    ...(technology && { technology }),
    ...(status && { status }),
    ...(search && { title: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    db.psDemo.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ industry: "asc" }, { technology: "asc" }, { title: "asc" }],
      ...paginationToSkipTake(pagination),
    }),
    db.psDemo.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/** POST /api/demos */
export const POST = withDemoAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "demos", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const demo = await db.$transaction(async (tx) => {
    const row = await tx.psDemo.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
      select: LIST_SELECT,
    });
    await writeAudit(tx, { orgId, userId, action: "demo.create", resource: row.id });
    return row;
  });

  return createdSerialized(demo);
});
