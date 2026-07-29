import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";

const withRfpAuth = withOrgAuthForModule("rfp");

const updateSchema = z
  .object({
    text: z.string().min(1).max(8000).optional(),
    category: z.string().max(60).nullable().optional(),
    complianceStatus: z.enum(["compliant", "partial", "gap", "clarify"]).optional(),
    responseText: z.string().max(20000).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict("Unknown field");

/**
 * PATCH /api/rfps/[id]/requirements/[reqId]
 *
 * The main editing surface for the compliance matrix. After each write we
 * recompute whether every requirement now has a response and flip the parent
 * RFP to `responded` (or back off it) — so the status reflects reality rather
 * than needing a separate user action to stay accurate.
 */
export const PATCH = withRfpAuth<{ id: string; reqId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "rfp", "update");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const existing = await db.psRfpRequirement.findFirst({
      where: { id: params.reqId, orgId, rfpId: params.id },
      select: { id: true, rfp: { select: { id: true, status: true } } },
    });
    if (!existing) return notFound("Requirement");

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.psRfpRequirement.update({
        where: { id: existing.id },
        data: parsed.data,
      });

      const outstanding = await tx.psRfpRequirement.count({
        where: { orgId, rfpId: existing.rfp.id, responseText: null },
      });
      const total = await tx.psRfpRequirement.count({
        where: { orgId, rfpId: existing.rfp.id },
      });

      // `submitted` is terminal — never walk it back automatically.
      if (existing.rfp.status !== "submitted") {
        const nextStatus = total > 0 && outstanding === 0 ? "responded" : "extracted";
        if (nextStatus !== existing.rfp.status) {
          await tx.psRfp.update({
            where: { id: existing.rfp.id },
            data: { status: nextStatus, updatedBy: userId },
          });
        }
      }

      await writeAudit(tx, {
        orgId,
        userId,
        action: "rfp.requirement.update",
        resource: row.id,
        metadata: { rfpId: existing.rfp.id, fields: Object.keys(parsed.data) },
      });

      return row;
    });

    return okSerialized(updated);
  },
);

/** DELETE /api/rfps/[id]/requirements/[reqId] */
export const DELETE = withRfpAuth<{ id: string; reqId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "rfp", "update");
    if (denied) return denied;

    const existing = await db.psRfpRequirement.findFirst({
      where: { id: params.reqId, orgId, rfpId: params.id },
      select: { id: true },
    });
    if (!existing) return notFound("Requirement");

    await db.$transaction(async (tx) => {
      await tx.psRfpRequirement.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "rfp.requirement.delete",
        resource: existing.id,
        metadata: { rfpId: params.id },
      });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
