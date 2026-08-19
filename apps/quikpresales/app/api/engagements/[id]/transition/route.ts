import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { canTransition, closedStatusFor, isStage, STAGE_LABEL, STAGE_PROBABILITY, type Stage } from "@/lib/pipeline";
import { evaluateChecklist } from "@/lib/pipeline-checklist";

const withEngagementAuth = withOrgAuthForModule("engagements");

const transitionSchema = z.object({
  toStage: z.string().refine(isStage, "Unknown target stage"),
  justification: z.string().max(1000).optional(),
});

/**
 * GET /api/engagements/[id]/transition?toStage=X — preview the stage-entry
 * checklist without moving anything, so the UI can show what's missing
 * before the user even attempts the move.
 */
export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const toStageRaw = req.nextUrl.searchParams.get("toStage");
    if (!toStageRaw || !isStage(toStageRaw)) return fail(400, "toStage query param is required");

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) return notFound("Engagement");

    const result = await evaluateChecklist(orgId, engagement.id, toStageRaw);
    return okSerialized(result);
  },
);

/**
 * POST /api/engagements/[id]/transition
 *
 * The single path that can move an engagement's stage. Validates against the
 * state machine in lib/pipeline.ts, then writes the stage change, the timeline
 * entry and the audit row in one transaction — so an engagement can never end
 * up moved without a trace of who moved it.
 *
 * Closing to won/lost also flips `closedStatus`, which is what makes the stage
 * terminal on subsequent calls.
 */
export const POST = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "update");
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const toStage = parsed.data.toStage as Stage;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true, stage: true, closedStatus: true },
    });
    if (!engagement) return notFound("Engagement");

    // Guard the closed flag as well as the stage: they are written together,
    // but a row edited outside this endpoint could disagree.
    if (engagement.closedStatus !== "open") {
      return fail(409, `Engagement is already ${engagement.closedStatus} and cannot be moved`);
    }

    const check = canTransition(engagement.stage, toStage);
    if (!check.ok) return fail(check.status ?? 400, check.reason ?? "Invalid transition");

    const checklist = await evaluateChecklist(orgId, engagement.id, toStage);
    if (!checklist.allMet) {
      const unmet = checklist.items.filter((i) => !i.met).map((i) => i.label);
      return fail(
        409,
        `Cannot move to ${STAGE_LABEL[toStage]} yet — ${unmet.join("; ")}`,
      );
    }

    const fromStage = engagement.stage;

    await db.$transaction(async (tx) => {
      await tx.psEngagement.update({
        where: { id: engagement.id },
        data: {
          stage: toStage,
          closedStatus: closedStatusFor(toStage),
          probability: STAGE_PROBABILITY[toStage],
          daysInStage: 0,
          updatedBy: userId,
        },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: engagement.id,
        type: "stage-advanced",
        actorId: userId,
        summary: `Moved from ${STAGE_LABEL[fromStage as Stage]} to ${STAGE_LABEL[toStage]}`,
        payload: {
          fromStage,
          toStage,
          ...(parsed.data.justification ? { justification: parsed.data.justification } : {}),
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.transition",
        resource: engagement.id,
        metadata: { fromStage, toStage },
      });
    });

    return okSerialized({ id: engagement.id, fromStage, toStage });
  },
);
