import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { parseSections } from "@/lib/proposals/sections";

const withProposalAuth = withOrgAuthForModule("proposals");

/** `status` moves go through POST /transition; content edits create versions. */
const updateSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    rfpId: z.string().nullable().optional(),
  })
  .strict("Unknown field. Status changes use POST /transition; content edits POST /versions.");

/** GET /api/proposals/[id] — detail with the current version's sections. */
export const GET = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "view");
    if (denied) return denied;

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        engagementId: true,
        rfpId: true,
        title: true,
        status: true,
        currentVersionId: true,
        approvedAt: true,
        approvedById: true,
        createdAt: true,
        updatedAt: true,
        engagement: { select: { id: true, title: true } },
        currentVersion: {
          select: {
            id: true,
            version: true,
            sections: true,
            changeNote: true,
            source: true,
            createdAt: true,
            createdBy: true,
          },
        },
        _count: { select: { versions: true } },
      },
    });
    if (!proposal) return notFound("Proposal");

    return okSerialized({
      ...proposal,
      currentVersion: proposal.currentVersion
        ? { ...proposal.currentVersion, sections: parseSections(proposal.currentVersion.sections) }
        : null,
    });
  },
);

/** PATCH /api/proposals/[id] — metadata only. */
export const PATCH = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "update");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, engagementId: true },
    });
    if (!proposal) return notFound("Proposal");

    // Re-link only to an RFP on the same engagement.
    if (parsed.data.rfpId) {
      const rfp = await db.psRfp.findFirst({
        where: { id: parsed.data.rfpId, orgId, engagementId: proposal.engagementId },
        select: { id: true },
      });
      if (!rfp) return notFound("RFP");
    }

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.psProposal.update({
        where: { id: proposal.id },
        data: { ...parsed.data, updatedBy: userId },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "proposal.update",
        resource: row.id,
        metadata: { fields: Object.keys(parsed.data) },
      });
      return row;
    });

    return okSerialized(updated);
  },
);

/** DELETE /api/proposals/[id] — hard delete; versions cascade. */
export const DELETE = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "delete");
    if (denied) return denied;

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, title: true, status: true, engagementId: true },
    });
    if (!proposal) return notFound("Proposal");

    if (proposal.status === "approved" || proposal.status === "won") {
      return fail(409, `Cannot delete a proposal that is ${proposal.status}`);
    }

    await db.$transaction(async (tx) => {
      // Break the FK before deleting, or the currentVersion reference blocks
      // the cascade from the versions side.
      await tx.psProposal.update({
        where: { id: proposal.id },
        data: { currentVersionId: null },
      });
      await tx.psProposal.delete({ where: { id: proposal.id } });

      await writeTimeline(tx, {
        orgId,
        engagementId: proposal.engagementId,
        type: "proposal-deleted",
        actorId: userId,
        summary: `Deleted proposal "${proposal.title}"`,
      });
      await writeAudit(tx, { orgId, userId, action: "proposal.delete", resource: proposal.id });
    });

    return okSerialized({ id: proposal.id, deleted: true });
  },
);
