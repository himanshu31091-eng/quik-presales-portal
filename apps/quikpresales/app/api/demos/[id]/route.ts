import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { DEMO_STATUSES } from "@/lib/library/constants";

const withDemoAuth = withOrgAuthForModule("library.demos");

const updateSchema = z
  .object({
    industry: z.string().min(1).max(80).optional(),
    technology: z.string().min(1).max(80).optional(),
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    blobUrl: z.string().url().nullable().optional(),
    recordingUrl: z.string().url().nullable().optional(),
    scriptDocId: z.string().nullable().optional(),
    status: z.enum(DEMO_STATUSES).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    /**
     * A single rating (1–5) from one viewer. The stored average and count are
     * recomputed server-side — a client cannot set `feedbackScore` directly.
     */
    rating: z.number().min(1).max(5).optional(),
  })
  .strict("Unknown field");

/** GET /api/demos/[id] */
export const GET = withDemoAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const denied = await requirePermission(userId, orgId, "demos", "view");
  if (denied) return denied;

  const demo = await db.psDemo.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
  });
  if (!demo) return notFound("Demo");

  return okSerialized(demo);
});

/** PATCH /api/demos/[id] — edit, and/or submit a feedback rating. */
export const PATCH = withDemoAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const denied = await requirePermission(userId, orgId, "demos", "update");
  if (denied) return denied;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

  const existing = await db.psDemo.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, feedbackScore: true, feedbackCount: true },
  });
  if (!existing) return notFound("Demo");

  const { rating, ...fields } = parsed.data;

  // Running average. Stored as an aggregate rather than individual rows
  // because the spec only calls for a satisfaction score, not per-user
  // feedback history — revisit if we ever need "who rated what".
  let feedback: { feedbackScore: number; feedbackCount: number } | undefined;
  if (rating !== undefined) {
    const count = existing.feedbackCount + 1;
    const total = (existing.feedbackScore ?? 0) * existing.feedbackCount + rating;
    feedback = { feedbackScore: Number((total / count).toFixed(2)), feedbackCount: count };
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.psDemo.update({
      where: { id: existing.id },
      data: { ...fields, ...feedback, updatedBy: userId },
    });
    await writeAudit(tx, {
      orgId,
      userId,
      action: rating !== undefined ? "demo.feedback" : "demo.update",
      resource: row.id,
      metadata: { fields: Object.keys(parsed.data) },
    });
    return row;
  });

  return okSerialized(updated);
});

/** DELETE /api/demos/[id] — soft delete. */
export const DELETE = withDemoAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "demos", "delete");
    if (denied) return denied;

    const existing = await db.psDemo.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Demo");

    await db.$transaction(async (tx) => {
      await tx.psDemo.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      await writeAudit(tx, { orgId, userId, action: "demo.delete", resource: existing.id });
    });

    return okSerialized({ id: existing.id, deleted: true });
  },
);
