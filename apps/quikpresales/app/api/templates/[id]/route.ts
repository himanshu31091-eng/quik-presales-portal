import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { TEMPLATE_KINDS } from "@/lib/library/constants";

const withTemplateAuth = withOrgAuthForModule("library.templates");

const updateSchema = z
  .object({
    kind: z.enum(TEMPLATE_KINDS).optional(),
    name: z.string().min(2).max(160).optional(),
    description: z.string().max(2000).nullable().optional(),
    content: z.unknown().optional(),
    industry: z.string().max(80).nullable().optional(),
    technology: z.string().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict("Unknown field");

/** GET /api/templates/[id] — full record including `content`. */
export const GET = withTemplateAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "templates", "view");
    if (denied) return denied;

    const template = await db.psTemplate.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!template) return notFound("Template");

    return okSerialized(template);
  },
);

/**
 * PATCH /api/templates/[id]
 *
 * Editing `content` bumps `version`. Templates aren't version-history-backed
 * like proposals — the counter is a cheap staleness signal so consumers can
 * tell a template changed since they copied from it.
 */
export const PATCH = withTemplateAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "templates", "update");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const existing = await db.psTemplate.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Template");

    const { content, ...rest } = parsed.data;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.psTemplate.update({
        where: { id: existing.id },
        data: {
          ...rest,
          ...(content !== undefined && {
            content: content as Prisma.InputJsonValue,
            version: { increment: 1 },
          }),
          updatedBy: userId,
        },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "template.update",
        resource: row.id,
        metadata: { fields: Object.keys(parsed.data) },
      });
      return row;
    });

    return okSerialized(updated);
  },
);

/**
 * DELETE /api/templates/[id] — soft delete.
 *
 * Proposals record only the section content they copied, not a live FK, so a
 * deleted template can't orphan anything — but keeping the row means an
 * accidental delete is recoverable.
 */
export const DELETE = withTemplateAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "templates", "delete");
    if (denied) return denied;

    const existing = await db.psTemplate.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Template");

    await db.$transaction(async (tx) => {
      await tx.psTemplate.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
      });
      await writeAudit(tx, { orgId, userId, action: "template.delete", resource: existing.id });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
