import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";

const withEngagementAuth = withOrgAuthForModule("engagements");

/**
 * `stage` is deliberately absent. Stage moves go through
 * POST /api/engagements/[id]/transition so the state machine, timeline entry
 * and audit row can never be bypassed by a plain field update.
 */
const updateSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    industry: z.string().max(80).nullable().optional(),
    territory: z.string().max(80).nullable().optional(),
    salesOwnerId: z.string().nullable().optional(),
    presalesOwnerId: z.string().nullable().optional(),
    estRevenue: z.string().regex(/^\d+$/, "estRevenue must be whole paise").nullable().optional(),
    currency: z.string().length(3).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    expectedClose: z.string().datetime().nullable().optional(),
    competitors: z.array(z.string().max(80)).max(20).optional(),
    techStack: z.array(z.string().max(80)).max(30).optional(),
    riskScore: z.number().int().min(0).max(100).nullable().optional(),
    crmOpportunityId: z.string().max(64).nullable().optional(),
    crmAccountId: z.string().max(64).nullable().optional(),
    crmLeadId: z.string().max(64).nullable().optional(),
  })
  .strict("Unknown field. Stage changes use POST /transition.");

/** GET /api/engagements/[id] — detail with child counts. */
export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        winLoss: true,
        poc: true,
        _count: {
          select: { documents: true, rfps: true, proposals: true, estimates: true, timelineEvents: true },
        },
      },
    });
    if (!engagement) return notFound("Engagement");

    return okSerialized(engagement);
  },
);

/** PATCH /api/engagements/[id] — partial update (never the stage). */
export const PATCH = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "update");
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const existing = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!existing) return notFound("Engagement");

    const { estRevenue, expectedClose, ...rest } = parsed.data;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.psEngagement.update({
        where: { id: existing.id },
        data: {
          ...rest,
          updatedBy: userId,
          ...(estRevenue !== undefined && {
            estRevenue: estRevenue === null ? null : BigInt(estRevenue),
          }),
          ...(expectedClose !== undefined && {
            expectedClose: expectedClose === null ? null : new Date(expectedClose),
          }),
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.update",
        resource: row.id,
        metadata: { fields: Object.keys(parsed.data) },
      });

      return row;
    });

    return okSerialized(updated);
  },
);

/**
 * DELETE /api/engagements/[id] — soft delete.
 *
 * Sets `deletedAt` rather than removing the row: engagements are referenced by
 * win/loss analysis and the weekly rollups, and a hard delete would cascade
 * away proposals and RFPs that may be the only record of work done.
 */
export const DELETE = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "delete");
    if (denied) return denied;

    const existing = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!existing) return notFound("Engagement");

    await db.$transaction(async (tx) => {
      await tx.psEngagement.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      await writeTimeline(tx, {
        orgId,
        engagementId: existing.id,
        type: "deleted",
        actorId: userId,
        summary: `Deleted engagement "${existing.title}"`,
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.delete",
        resource: existing.id,
      });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
