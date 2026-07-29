import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { KNOWLEDGE_KINDS, buildSearchText } from "@/lib/library/constants";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withKnowledgeAuth = withOrgAuthForModule("library.knowledge");

const listQuery = z.object({
  kind: z.enum(KNOWLEDGE_KINDS).optional(),
  industry: z.string().max(80).optional(),
  technology: z.string().max(80).optional(),
  tag: z.string().max(80).optional(),
});

const createSchema = z.object({
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  body: z.string().max(200_000).optional(),
  blobUrl: z.string().url().optional(),
  industry: z.string().max(80).optional(),
  technology: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

const LIST_SELECT = {
  id: true,
  kind: true,
  title: true,
  industry: true,
  technology: true,
  tags: true,
  blobUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PsKnowledgeAssetSelect;

/** GET /api/knowledge — browse. Use /api/knowledge/search for text queries. */
export const GET = withKnowledgeAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "knowledge", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { kind, industry, technology, tag } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsKnowledgeAssetWhereInput = {
    orgId,
    deletedAt: null,
    ...(kind && { kind }),
    ...(industry && { industry }),
    ...(technology && { technology }),
    ...(tag && { tags: { has: tag } }),
  };

  const [items, total] = await Promise.all([
    db.psKnowledgeAsset.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psKnowledgeAsset.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/** POST /api/knowledge */
export const POST = withKnowledgeAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "knowledge", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const asset = await db.$transaction(async (tx) => {
    const row = await tx.psKnowledgeAsset.create({
      data: {
        orgId,
        ...parsed.data,
        // Denormalised so one ILIKE covers title + body + tags.
        searchText: buildSearchText(parsed.data),
        createdBy: userId,
        updatedBy: userId,
      },
      select: LIST_SELECT,
    });
    await writeAudit(tx, { orgId, userId, action: "knowledge.create", resource: row.id });
    return row;
  });

  return createdSerialized(asset);
});
