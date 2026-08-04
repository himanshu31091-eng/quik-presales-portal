import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { STAGE_PROBABILITY, closedStatusFor } from "@/lib/pipeline";
import { REJECTION_REASONS, REJECTION_REASON_LABEL } from "@/lib/leads/rejection";

const withLeadAuth = withOrgAuthForModule("engagements");

/**
 * The pre-sales accept/reject gate.
 *
 * This is a human judgement, deliberately: the requirement evaluation upstream
 * only says whether a brief is *scopeable*, not whether the work is worth taking.
 * Fit, capacity, margin and strategic value are not in the brief, so a person
 * decides — but they must record why.
 *
 * Rejection reasons are structured rather than free text alone, because the point
 * of capturing them is to aggregate: "how many leads did we decline for lack of
 * capacity this quarter" is the question worth answering, and prose cannot be
 * counted. `reasonText` carries the specifics on top.
 */

/**
 * Why a lead was declined. Chosen to cover the reasons pre-sales actually gives,
 * and to stay stable enough to trend over time.
 */

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("accept"),
    /** Optional note — an acceptance does not need justifying to proceed. */
    note: z.string().max(2000).optional(),
    presalesOwnerId: z.string().max(64).optional(),
    /** Set false to accept a lead whose blockers are still open, with a reason. */
    overrideOpenBlockers: z.boolean().default(false),
  }),
  z.object({
    decision: z.literal("reject"),
    reasonCategory: z.enum(REJECTION_REASONS),
    /** Required: a category alone does not tell the salesperson what to fix. */
    reasonText: z.string().min(10, "Explain the rejection in at least 10 characters").max(4000),
  }),
]);

/**
 * POST /api/leads/[id]/decision
 *
 *   accept → stage `qualification`, the lead enters the normal pipeline
 *   reject → stage `rejected` (terminal), with the reason recorded on PsWinLoss
 *
 * A rejection writes PsWinLoss so the reason is queryable alongside won/lost
 * analysis, but `closedStatus` is `rejected` rather than `lost`, so declined leads
 * never drag down the win rate.
 */
export const POST = withLeadAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const denied = await requirePermission(userId, orgId, "engagements", "approve");
  if (denied) return denied;

  const parsed = decisionSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  const engagement = await db.psEngagement.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: {
      id: true,
      title: true,
      stage: true,
      closedStatus: true,
      estRevenue: true,
      rfps: { select: { requirements: { select: { complianceStatus: true, responseText: true } } } },
    },
  });
  if (!engagement) return notFound("Lead");

  // Only a lead awaiting triage can be decided. Anything further along is past
  // this gate, and re-deciding it would rewrite history.
  if (engagement.stage !== "lead") {
    return fail(
      409,
      `This engagement is at "${engagement.stage}" and has already passed the lead decision`,
    );
  }

  if (input.decision === "accept") {
    // Guard the point of the whole gate: accepting a lead whose blockers are
    // unanswered puts pre-sales back to chasing sales, which is what the
    // evaluation exists to prevent. Allowed, but only deliberately.
    const requirements = engagement.rfps.flatMap((r) => r.requirements);
    const openBlockers = requirements.filter(
      (r) => r.complianceStatus === "gap" && (r.responseText ?? "").trim() === "",
    ).length;

    if (openBlockers > 0 && !input.overrideOpenBlockers) {
      return fail(
        409,
        `${openBlockers} blocking question(s) are still unanswered. Ask sales to complete them, or resubmit with overrideOpenBlockers to accept anyway.`,
      );
    }

    await db.$transaction(async (tx) => {
      await tx.psEngagement.update({
        where: { id: engagement.id },
        data: {
          stage: "qualification",
          closedStatus: closedStatusFor("qualification"),
          probability: STAGE_PROBABILITY.qualification,
          daysInStage: 0,
          presalesOwnerId: input.presalesOwnerId ?? userId,
          updatedBy: userId,
        },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: engagement.id,
        type: "lead-accepted",
        actorId: userId,
        summary: `Lead accepted into pre-sales${openBlockers > 0 ? ` (${openBlockers} blocker(s) overridden)` : ""}`,
        payload: {
          openBlockersAtAcceptance: openBlockers,
          overridden: openBlockers > 0,
          ...(input.note ? { note: input.note } : {}),
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "lead.accept",
        resource: engagement.id,
        metadata: { openBlockers, overridden: openBlockers > 0 },
      });
    });

    return okSerialized({
      id: engagement.id,
      decision: "accept",
      stage: "qualification",
      overriddenBlockers: openBlockers,
    });
  }

  // Reject.
  await db.$transaction(async (tx) => {
    await tx.psEngagement.update({
      where: { id: engagement.id },
      data: {
        stage: "rejected",
        closedStatus: closedStatusFor("rejected"),
        probability: 0,
        daysInStage: 0,
        updatedBy: userId,
      },
    });

    // PsWinLoss.engagementId is unique, so upsert rather than create — a lead
    // could in principle be decided after an earlier record exists.
    const existing = await tx.psWinLoss.findFirst({
      where: { orgId, engagementId: engagement.id },
      select: { id: true },
    });
    const winLossData = {
      outcome: "rejected",
      reasonCategory: input.reasonCategory,
      reasonText: input.reasonText,
      dealSize: engagement.estRevenue,
      capturedById: userId,
    };
    if (existing) {
      await tx.psWinLoss.update({ where: { id: existing.id }, data: winLossData });
    } else {
      await tx.psWinLoss.create({ data: { orgId, engagementId: engagement.id, ...winLossData } });
    }

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "lead-rejected",
      actorId: userId,
      summary: `Lead rejected — ${REJECTION_REASON_LABEL[input.reasonCategory]}`,
      payload: { reasonCategory: input.reasonCategory, reasonText: input.reasonText },
    });

    await writeAudit(tx, {
      orgId,
      userId,
      action: "lead.reject",
      resource: engagement.id,
      metadata: { reasonCategory: input.reasonCategory },
    });
  });

  return okSerialized({
    id: engagement.id,
    decision: "reject",
    stage: "rejected",
    reasonCategory: input.reasonCategory,
    reasonLabel: REJECTION_REASON_LABEL[input.reasonCategory],
  });
});
