import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withRfpAuth = withOrgAuthForModule("rfp");

const listQuery = z.object({
  engagementId: z.string().optional(),
  status: z.enum(["uploaded", "extracting", "extracted", "responded", "submitted"]).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  engagementId: z.string().min(1, "engagementId is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(160),
  sourceDocId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

const LIST_SELECT = {
  id: true,
  engagementId: true,
  title: true,
  status: true,
  dueDate: true,
  submittedAt: true,
  extractError: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { requirements: true } },
} satisfies Prisma.PsRfpSelect;

/** GET /api/rfps — paginated list. */
export const GET = withRfpAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "rfp", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, status, search } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsRfpWhereInput = {
    orgId,
    ...(engagementId && { engagementId }),
    ...(status && { status }),
    ...(search && { title: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    db.psRfp.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psRfp.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/** POST /api/rfps — register an uploaded RFP against an engagement. */
export const POST = withRfpAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "rfp", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, title, sourceDocId, dueDate } = parsed.data;

  const engagement = await db.psEngagement.findFirst({
    where: { id: engagementId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!engagement) return notFound("Engagement");

  // A source document must belong to the same org AND the same engagement —
  // org alone would let an RFP on engagement A cite a document from B.
  if (sourceDocId) {
    const doc = await db.psDocument.findFirst({
      where: { id: sourceDocId, orgId, engagementId: engagement.id },
      select: { id: true },
    });
    if (!doc) return notFound("Source document");
  }

  const rfp = await db.$transaction(async (tx) => {
    const row = await tx.psRfp.create({
      data: {
        orgId,
        engagementId: engagement.id,
        title,
        sourceDocId,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdBy: userId,
        updatedBy: userId,
      },
      select: LIST_SELECT,
    });

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "rfp-created",
      actorId: userId,
      summary: `Added RFP "${title}"`,
      payload: { rfpId: row.id },
    });
    await writeAudit(tx, { orgId, userId, action: "rfp.create", resource: row.id });

    return row;
  });

  return createdSerialized(rfp);
});
