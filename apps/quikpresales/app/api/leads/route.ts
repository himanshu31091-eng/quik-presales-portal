import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { STAGE_PROBABILITY } from "@/lib/pipeline";
import { evaluateRequirement } from "@/lib/ai/prompts/evaluate-requirement";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withLeadAuth = withOrgAuthForModule("engagements");

/** One Opus call at high effort over a short brief. */
export const maxDuration = 60;

/**
 * Lead intake — the front door of the pre-sales workflow.
 *
 * A salesperson submits an opportunity plus the requirement in their own words.
 * The portal evaluates that brief immediately and hands back the gaps, so sales
 * can close them before pre-sales ever looks at it. That first pass is what stops
 * every lead queueing behind the pre-sales head.
 *
 * Storage, without any schema change:
 *   - the opportunity becomes a PsEngagement at stage `lead`
 *   - the brief becomes a PsRfp (`extractedText`) — an RFP *is* a customer
 *     requirement document, and it already has the engagement link and status flow
 *   - each gap becomes a PsRfpRequirement with complianceStatus `clarify`, which
 *     already carries a `responseText` field for sales to answer inline
 *
 * Reusing the requirement rows means the existing RFP screens, the compliance
 * counts and the dashboard all understand this data for free.
 */

const leadSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(160),
  /** The brief in the salesperson's own words. The whole point of the intake. */
  requirement: z.string().min(40, "Describe the requirement in at least 40 characters").max(20_000),
  industry: z.string().max(60).optional(),
  territory: z.string().max(60).optional(),
  customerName: z.string().max(160).optional(),
  contactName: z.string().max(160).optional(),
  budgetHint: z.string().max(200).optional(),
  timelineHint: z.string().max(200).optional(),
  techStack: z.array(z.string().min(1).max(60)).max(12).default([]),
  crmOpportunityId: z.string().max(64).optional(),
  estRevenue: z.string().regex(/^\d{1,18}$/, "Must be an integer in minor units").optional(),
  currency: z.string().length(3).optional(),
});

/**
 * POST /api/leads — submit a lead and get the requirement assessment back.
 *
 * Returns 201 with the evaluation inline, so the salesperson sees the gaps in the
 * same interaction rather than waiting for a notification that does not exist yet.
 */
export const POST = withLeadAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "create");
  if (denied) return denied;

  const parsed = leadSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  // Evaluate before writing anything: if the model errors the caller gets a clean
  // failure rather than a half-created lead. evaluateRequirement never throws —
  // it degrades to `needs-info` — so this is about ordering, not error handling.
  const evaluation = await evaluateRequirement({
    title: input.title,
    requirement: input.requirement,
    industry: input.industry,
    budgetHint: input.budgetHint,
    timelineHint: input.timelineHint,
    techStack: input.techStack,
  });

  const created = await db.$transaction(async (tx) => {
    const engagement = await tx.psEngagement.create({
      data: {
        orgId,
        title: input.title,
        industry: input.industry,
        territory: input.territory,
        stage: "lead",
        closedStatus: "open",
        probability: STAGE_PROBABILITY.lead,
        techStack: input.techStack,
        salesOwnerId: userId,
        ...(input.crmOpportunityId ? { crmOpportunityId: input.crmOpportunityId } : {}),
        ...(input.estRevenue ? { estRevenue: BigInt(input.estRevenue) } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, title: true },
    });

    // The brief itself. `status` tracks the readiness flow: extracted means the
    // evaluation has run.
    const rfp = await tx.psRfp.create({
      data: {
        orgId,
        engagementId: engagement.id,
        title: `Requirement — ${input.title}`,
        status: "extracted",
        extractedText: input.requirement,
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });

    if (evaluation.gaps.length > 0) {
      await tx.psRfpRequirement.createMany({
        data: evaluation.gaps.map((gap, index) => ({
          orgId,
          rfpId: rfp.id,
          text: gap.question,
          category: gap.topic,
          // A blocker must be answered before pre-sales engages; a nice-to-have
          // only sharpens the estimate. `gap` vs `clarify` carries that.
          complianceStatus: gap.blocking ? "gap" : "clarify",
          citation: gap.why ? { quotedText: gap.why, page: null } : undefined,
          aiGenerated: true,
          sortOrder: index,
        })),
      });
    }

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "lead-submitted",
      actorId: userId,
      summary:
        evaluation.verdict === "ready"
          ? `Lead submitted — brief assessed as ready (${evaluation.completenessPct}% complete)`
          : `Lead submitted — ${evaluation.gaps.filter((g) => g.blocking).length} blocker(s) returned to sales`,
      payload: {
        rfpId: rfp.id,
        verdict: evaluation.verdict,
        completenessPct: evaluation.completenessPct,
        blockers: evaluation.gaps.filter((g) => g.blocking).length,
        isStub: evaluation.isStub,
      },
    });

    await writeAudit(tx, {
      orgId,
      userId,
      action: "lead.submit",
      resource: engagement.id,
      metadata: {
        verdict: evaluation.verdict,
        completenessPct: evaluation.completenessPct,
        gaps: evaluation.gaps.length,
        tokensUsed: evaluation.tokensUsed,
        isStub: evaluation.isStub,
      },
    });

    return { engagement, rfpId: rfp.id };
  });

  return createdSerialized({
    engagementId: created.engagement.id,
    rfpId: created.rfpId,
    title: created.engagement.title,
    stage: "lead",
    evaluation: {
      verdict: evaluation.verdict,
      completenessPct: evaluation.completenessPct,
      summary: evaluation.summary,
      assumedScope: evaluation.assumedScope,
      gaps: evaluation.gaps,
      isStub: evaluation.isStub,
    },
  });
});

/**
 * GET /api/leads — leads awaiting a pre-sales decision, newest first.
 *
 * The pre-sales queue. `readyForReview` is derived from the requirement rows
 * rather than stored, so it cannot drift out of step with the answers themselves:
 * a lead is ready when no blocking gap is still unanswered.
 */
export const GET = withLeadAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "view");
  if (denied) return denied;

  const params = parsePaginationParams(req.nextUrl.searchParams);

  const [rows, total] = await Promise.all([
    db.psEngagement.findMany({
      where: { orgId, deletedAt: null, stage: "lead" },
      select: {
        id: true,
        title: true,
        industry: true,
        territory: true,
        salesOwnerId: true,
        estRevenue: true,
        currency: true,
        createdAt: true,
        rfps: {
          select: {
            id: true,
            requirements: {
              select: { id: true, complianceStatus: true, responseText: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      ...paginationToSkipTake(params),
    }),
    db.psEngagement.count({ where: { orgId, deletedAt: null, stage: "lead" } }),
  ]);

  const data = rows.map((row) => {
    const requirements = row.rfps.flatMap((r) => r.requirements);
    const blockers = requirements.filter((r) => r.complianceStatus === "gap");
    const answered = blockers.filter((r) => (r.responseText ?? "").trim() !== "");

    return {
      id: row.id,
      title: row.title,
      industry: row.industry,
      territory: row.territory,
      salesOwnerId: row.salesOwnerId,
      estRevenue: row.estRevenue?.toString() ?? null,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      rfpId: row.rfps[0]?.id ?? null,
      blockerCount: blockers.length,
      blockersAnswered: answered.length,
      readyForReview: blockers.length === answered.length,
    };
  });

  return okSerialized(buildPaginationResponse(data, total, params));
});
