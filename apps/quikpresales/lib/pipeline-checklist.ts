import { db } from "@/lib/db";
import type { Stage } from "@/lib/pipeline";

/**
 * Stage-entry gates.
 *
 * Enforced (not advisory) on POST /api/engagements/[id]/transition: a move
 * into a gated stage 409s until every item is met. Deliberately no gates on
 * won/lost/rejected — closing a deal in either direction is always allowed
 * by the state machine in lib/pipeline.ts, and putting a checklist between a
 * rep and closing a deal adds friction at exactly the wrong moment.
 *
 * Each check reads the engagement's current state fresh rather than trusting
 * anything the client sends, so this can't be spoofed by a crafted request.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  met: boolean;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  allMet: boolean;
}

const NO_GATE: ChecklistResult = { items: [], allMet: true };

export async function evaluateChecklist(
  orgId: string,
  engagementId: string,
  toStage: Stage,
): Promise<ChecklistResult> {
  const items: ChecklistItem[] = [];

  if (toStage === "discovery") {
    const engagement = await db.psEngagement.findFirst({
      where: { id: engagementId, orgId },
      select: { industry: true, estRevenue: true },
    });
    items.push(
      { key: "industry", label: "Industry is set", met: !!engagement?.industry },
      { key: "value", label: "Estimated revenue is set", met: !!engagement?.estRevenue },
    );
  }

  if (toStage === "solution-design") {
    const rfps = await db.psRfp.findMany({
      where: { orgId, engagementId },
      select: { requirements: { select: { complianceStatus: true, responseText: true } } },
    });
    const blockers = rfps
      .flatMap((r) => r.requirements)
      .filter((r) => r.complianceStatus === "gap");
    const openBlockers = blockers.filter((r) => (r.responseText ?? "").trim() === "");
    items.push({
      key: "blockers-answered",
      label:
        blockers.length === 0
          ? "No blocking requirements on this deal's RFP(s)"
          : openBlockers.length === 0
            ? "All requirement blockers answered"
            : `${openBlockers.length} of ${blockers.length} requirement blocker(s) still unanswered`,
      met: openBlockers.length === 0,
    });
  }

  if (toStage === "proposal") {
    const proposalCount = await db.psProposal.count({ where: { orgId, engagementId } });
    items.push({
      key: "proposal-exists",
      label: "A proposal has been created for this engagement",
      met: proposalCount > 0,
    });
  }

  if (toStage === "negotiation") {
    const approvedProposals = await db.psProposal.count({
      where: { orgId, engagementId, status: { in: ["approved", "won", "lost"] } },
    });
    items.push({
      key: "proposal-approved",
      label: "At least one proposal has reached Approved",
      met: approvedProposals > 0,
    });
  }

  if (items.length === 0) return NO_GATE;
  return { items, allMet: items.every((i) => i.met) };
}
