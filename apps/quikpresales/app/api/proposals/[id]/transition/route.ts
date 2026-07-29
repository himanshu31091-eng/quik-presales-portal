import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  STATUS_LABEL,
  canTransitionStatus,
  isProposalStatus,
  requiresApproval,
  type ProposalStatus,
} from "@/lib/proposals/status";

const withProposalAuth = withOrgAuthForModule("proposals");

const transitionSchema = z.object({
  toStatus: z.string().refine(isProposalStatus, "Unknown target status"),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/proposals/[id]/transition
 *
 * The only path that moves a proposal's status. Moving into `approved` needs
 * `proposals:approve` — a separate grant from `update`, so a presales engineer
 * can draft and submit for review but only an architect or admin can sign off.
 */
export const POST = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const parsed = transitionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);

    const toStatus = parsed.data.toStatus as ProposalStatus;

    // Permission depends on the destination, so check it before anything else
    // that could leak whether the proposal exists.
    const denied = await requirePermission(
      userId,
      orgId,
      "proposals",
      requiresApproval(toStatus) ? "approve" : "update",
    );
    if (denied) return denied;

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        title: true,
        status: true,
        engagementId: true,
        currentVersionId: true,
      },
    });
    if (!proposal) return notFound("Proposal");

    const check = canTransitionStatus(proposal.status, toStatus);
    if (!check.ok) return fail(check.status ?? 400, check.reason ?? "Invalid transition");

    // Approving a proposal with no content would produce an approved, empty
    // document — almost certainly a mis-click.
    if (toStatus === "approved" && !proposal.currentVersionId) {
      return fail(409, "Cannot approve a proposal with no content");
    }

    const fromStatus = proposal.status;

    await db.$transaction(async (tx) => {
      await tx.psProposal.update({
        where: { id: proposal.id },
        data: {
          status: toStatus,
          updatedBy: userId,
          // Stamp the approver on the way in; clear it if the proposal is sent
          // back for changes, so the record never claims a stale sign-off.
          ...(toStatus === "approved"
            ? { approvedAt: new Date(), approvedById: userId }
            : fromStatus === "approved"
              ? { approvedAt: null, approvedById: null }
              : {}),
        },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: proposal.engagementId,
        type: toStatus === "approved" ? "proposal-approved" : "proposal-status-changed",
        actorId: userId,
        summary: `Proposal "${proposal.title}": ${STATUS_LABEL[fromStatus as ProposalStatus]} → ${STATUS_LABEL[toStatus]}`,
        payload: {
          proposalId: proposal.id,
          fromStatus,
          toStatus,
          ...(parsed.data.note ? { note: parsed.data.note } : {}),
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "proposal.transition",
        resource: proposal.id,
        metadata: { fromStatus, toStatus },
      });
    });

    return okSerialized({ id: proposal.id, fromStatus, toStatus });
  },
);
