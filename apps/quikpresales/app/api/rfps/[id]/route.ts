import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";

const withRfpAuth = withOrgAuthForModule("rfp");

/**
 * `status` is not directly settable except for the terminal `submitted` move —
 * `extracting`/`extracted` are owned by the extract job, and `responded` is
 * derived from whether every requirement has a response.
 */
const updateSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    submitted: z.literal(true).optional(),
  })
  .strict("Unknown field");

/** GET /api/rfps/[id] — detail. Poll this for extraction status. */
export const GET = withRfpAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "view");
  if (denied) return denied;

  const rfp = await db.psRfp.findFirst({
    where: { id: params.id, orgId },
    select: {
      id: true,
      engagementId: true,
      sourceDocId: true,
      title: true,
      status: true,
      extractError: true,
      extractedText: true,
      dueDate: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      engagement: { select: { id: true, title: true } },
      _count: { select: { requirements: true } },
    },
  });
  if (!rfp) return notFound("RFP");

  // Progress signal for the compliance matrix header.
  const answered = await db.psRfpRequirement.count({
    where: { orgId, rfpId: rfp.id, NOT: { responseText: null } },
  });

  return okSerialized({ ...rfp, answeredCount: answered });
});

/** PATCH /api/rfps/[id] — edit metadata, or mark submitted. */
export const PATCH = withRfpAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "update");
  if (denied) return denied;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

  const rfp = await db.psRfp.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, title: true, status: true, engagementId: true },
  });
  if (!rfp) return notFound("RFP");

  const { title, dueDate, submitted } = parsed.data;

  if (submitted && rfp.status === "submitted") {
    return fail(409, "RFP has already been submitted");
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.psRfp.update({
      where: { id: rfp.id },
      data: {
        ...(title !== undefined && { title }),
        ...(dueDate !== undefined && { dueDate: dueDate === null ? null : new Date(dueDate) }),
        ...(submitted && { status: "submitted", submittedAt: new Date() }),
        updatedBy: userId,
      },
    });

    if (submitted) {
      await writeTimeline(tx, {
        orgId,
        engagementId: rfp.engagementId,
        type: "rfp-submitted",
        actorId: userId,
        summary: `Submitted RFP response for "${row.title}"`,
        payload: { rfpId: rfp.id },
      });
    }
    await writeAudit(tx, {
      orgId,
      userId,
      action: submitted ? "rfp.submit" : "rfp.update",
      resource: rfp.id,
    });

    return row;
  });

  return okSerialized(updated);
});

/** DELETE /api/rfps/[id] — hard delete; requirements cascade. */
export const DELETE = withRfpAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "delete");
  if (denied) return denied;

  const rfp = await db.psRfp.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, title: true, engagementId: true },
  });
  if (!rfp) return notFound("RFP");

  await db.$transaction(async (tx) => {
    await tx.psRfp.delete({ where: { id: rfp.id } });
    await writeTimeline(tx, {
      orgId,
      engagementId: rfp.engagementId,
      type: "rfp-deleted",
      actorId: userId,
      summary: `Deleted RFP "${rfp.title}"`,
    });
    await writeAudit(tx, { orgId, userId, action: "rfp.delete", resource: rfp.id });
  });

  return okSerialized({ id: rfp.id, deleted: true });
});
