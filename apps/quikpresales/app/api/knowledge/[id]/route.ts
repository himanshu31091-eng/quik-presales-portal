import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { KNOWLEDGE_KINDS, buildSearchText } from "@/lib/library/constants";

const withKnowledgeAuth = withOrgAuthForModule("library.knowledge");

const updateSchema = z
  .object({
    kind: z.enum(KNOWLEDGE_KINDS).optional(),
    title: z.string().min(2).max(200).optional(),
    body: z.string().max(200_000).nullable().optional(),
    blobUrl: z.string().url().nullable().optional(),
    industry: z.string().max(80).nullable().optional(),
    technology: z.string().max(80).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
  })
  .strict("Unknown field");

/** GET /api/knowledge/[id] — full asset including body. */
export const GET = withKnowledgeAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "knowledge", "view");
    if (denied) return denied;

    const asset = await db.psKnowledgeAsset.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!asset) return notFound("Knowledge asset");

    return okSerialized(asset);
  },
);

/** PATCH /api/knowledge/[id] — keeps `searchText` in sync. */
export const PATCH = withKnowledgeAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "knowledge", "update");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const existing = await db.psKnowledgeAsset.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true, body: true, tags: true, industry: true, technology: true },
    });
    if (!existing) return notFound("Knowledge asset");

    // Rebuild the haystack from the merged record — recomputing from the patch
    // alone would drop whichever fields weren't included in this request.
    const merged = {
      title: parsed.data.title ?? existing.title,
      body: parsed.data.body !== undefined ? parsed.data.body : existing.body,
      tags: parsed.data.tags ?? existing.tags,
      industry: parsed.data.industry !== undefined ? parsed.data.industry : existing.industry,
      technology:
        parsed.data.technology !== undefined ? parsed.data.technology : existing.technology,
    };

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.psKnowledgeAsset.update({
        where: { id: existing.id },
        data: { ...parsed.data, searchText: buildSearchText(merged), updatedBy: userId },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "knowledge.update",
        resource: row.id,
        metadata: { fields: Object.keys(parsed.data) },
      });
      return row;
    });

    return okSerialized(updated);
  },
);

/** DELETE /api/knowledge/[id] — soft delete. */
export const DELETE = withKnowledgeAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "knowledge", "delete");
    if (denied) return denied;

    const existing = await db.psKnowledgeAsset.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Knowledge asset");

    await db.$transaction(async (tx) => {
      await tx.psKnowledgeAsset.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      await writeAudit(tx, { orgId, userId, action: "knowledge.delete", resource: existing.id });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
