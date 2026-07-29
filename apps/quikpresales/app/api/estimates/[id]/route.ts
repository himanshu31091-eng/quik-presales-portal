import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { computeLineAmount, parsePaise, sumAmounts } from "@/lib/estimates/money";

const withEstimateAuth = withOrgAuthForModule("estimates");

const lineSchema = z.object({
  description: z.string().min(1).max(500),
  role: z.string().max(120).optional(),
  quantity: z.number().min(0).max(1_000_000),
  unit: z.string().max(40).optional(),
  rate: z.string().regex(/^\d{1,18}$/, "rate must be whole paise"),
});

const updateSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    currency: z.string().length(3).optional(),
    assumptions: z.string().max(20_000).nullable().optional(),
    status: z.enum(["draft", "final"]).optional(),
    /** Full replacement of the line set — see note below. */
    lines: z.array(lineSchema).max(500).optional(),
  })
  .strict("Unknown field");

/** GET /api/estimates/[id] — estimate with its lines. */
export const GET = withEstimateAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "estimates", "view");
    if (denied) return denied;

    const estimate = await db.psCostEstimate.findFirst({
      where: { id: params.id, orgId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        engagement: { select: { id: true, title: true } },
      },
    });
    if (!estimate) return notFound("Estimate");

    return okSerialized(estimate);
  },
);

/**
 * PATCH /api/estimates/[id]
 *
 * `lines` is a full replacement, not a patch: the editor is a grid where the
 * user reorders, inserts and deletes rows freely, so diffing individual lines
 * client-side would be more error-prone than sending the grid as it stands.
 * Amounts and the total are always recomputed server-side.
 *
 * A `final` estimate is locked — it is the number quoted to the customer.
 * Reopen it to `draft` in the same request if you need to change it.
 */
export const PATCH = withEstimateAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "estimates", "update");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const existing = await db.psCostEstimate.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return notFound("Estimate");

    const reopening = parsed.data.status === "draft";
    if (existing.status === "final" && !reopening) {
      return fail(409, "Estimate is final. Set status to \"draft\" to reopen it before editing.");
    }

    const { lines, ...fields } = parsed.data;

    const updated = await db.$transaction(async (tx) => {
      let totalAmount: bigint | undefined;

      if (lines) {
        const computed = lines.map((line, index) => {
          const rate = parsePaise(line.rate) ?? 0n;
          return {
            orgId,
            estimateId: existing.id,
            description: line.description,
            role: line.role,
            quantity: line.quantity,
            unit: line.unit,
            rate,
            amount: computeLineAmount(rate, line.quantity),
            sortOrder: index,
          };
        });

        await tx.psEstimateLine.deleteMany({ where: { orgId, estimateId: existing.id } });
        if (computed.length > 0) {
          await tx.psEstimateLine.createMany({ data: computed });
        }
        totalAmount = sumAmounts(computed.map((l) => l.amount));
      }

      const row = await tx.psCostEstimate.update({
        where: { id: existing.id },
        data: { ...fields, ...(totalAmount !== undefined && { totalAmount }), updatedBy: userId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "estimate.update",
        resource: row.id,
        metadata: { fields: Object.keys(parsed.data), lineCount: lines?.length },
      });

      return row;
    });

    return okSerialized(updated);
  },
);

/** DELETE /api/estimates/[id] — hard delete; lines cascade. */
export const DELETE = withEstimateAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "estimates", "delete");
    if (denied) return denied;

    const existing = await db.psCostEstimate.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return notFound("Estimate");
    if (existing.status === "final") {
      return fail(409, "Cannot delete a final estimate");
    }

    await db.$transaction(async (tx) => {
      await tx.psCostEstimate.delete({ where: { id: existing.id } });
      await writeAudit(tx, { orgId, userId, action: "estimate.delete", resource: existing.id });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
