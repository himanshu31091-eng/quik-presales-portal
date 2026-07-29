import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

/**
 * The AI collaborator is mocked so these tests assert the route's behaviour —
 * what it reads, what it persists, what it refuses — rather than a model call.
 * `assessDealHealth` has its own contract (it never throws; it degrades to an
 * amber stub), so the route is entitled to assume a result comes back.
 */
const assessDealHealth = vi.fn();
vi.mock("@/lib/ai/prompts/deal-health", () => ({
  assessDealHealth: (...args: unknown[]) => assessDealHealth(...args),
}));

import { POST as DEAL_HEALTH } from "@/app/api/engagements/[id]/deal-health/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req() {
  return new NextRequest(
    new Request("http://localhost:3015/api/engagements/eng-1/deal-health", { method: "POST" }),
  );
}

/** An open engagement with enough signal for a real assessment. */
function openEngagement(overrides: Record<string, unknown> = {}) {
  return {
    id: "eng-1",
    title: "Acme ERP rollout",
    stage: "proposal",
    closedStatus: "open",
    industry: "Manufacturing",
    competitors: ["Infosys", "TCS"],
    techStack: ["SAP"],
    probability: 60,
    estRevenue: BigInt(500_000_000),
    currency: "INR",
    expectedClose: new Date("2026-09-01"),
    daysInStage: 42,
    ...overrides,
  };
}

/** Seed the six aggregate queries the route fans out, in call order. */
function seedSignals() {
  mockDb.psRfp.count.mockResolvedValue(1 as never);
  mockDb.psRfpRequirement.count
    .mockResolvedValueOnce(30 as never) // requirementCount
    .mockResolvedValueOnce(4 as never); // gapCount
  mockDb.psProposal.count.mockResolvedValue(1 as never);
  mockDb.psProposal.findFirst.mockResolvedValue({ status: "internal-review" } as never);
  mockDb.psTimelineEvent.count.mockResolvedValue(3 as never);
  mockDb.psTimelineEvent.findFirst.mockResolvedValue({
    createdAt: new Date(Date.now() - 5 * 86_400_000),
  } as never);
}

beforeEach(() => {
  resetMockDb();
  assessDealHealth.mockReset();
  assessDealHealth.mockResolvedValue({
    health: "red",
    riskScore: 78,
    rationale: "42 days in proposal stage with two named competitors.",
    risks: ["Stalled in proposal stage"],
    nextActions: ["Chase the buyer for feedback"],
    tokensUsed: 900,
    isStub: false,
  });
});

describe("POST /api/engagements/[id]/deal-health", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });
    expect(res.status).toBe(401);
    expect(assessDealHealth).not.toHaveBeenCalled();
  });

  it("403s without the engagements update grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);

    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });

    expect(res.status).toBe(403);
    // Must not spend a model call on a request it is going to refuse.
    expect(assessDealHealth).not.toHaveBeenCalled();
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null as never);

    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_B,
      deletedAt: null,
    });
    expect(assessDealHealth).not.toHaveBeenCalled();
  });

  it("409s on a closed engagement rather than scoring a known outcome", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(
      openEngagement({ closedStatus: "won", stage: "won" }) as never,
    );

    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });

    expect(res.status).toBe(409);
    expect(assessDealHealth).not.toHaveBeenCalled();
    // And nothing is written onto the closed row.
    expect(mockDb.psEngagement.update).not.toHaveBeenCalled();
  });

  it("persists the assessment onto the columns the dashboard reads", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(openEngagement() as never);
    seedSignals();

    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ health: "red", riskScore: 78 });

    // These three columns existed but nothing wrote them before, which is why
    // the dashboard's deal-health panel was always empty.
    const written = mockDb.psEngagement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(written).toMatchObject({ aiDealHealth: "red", riskScore: 78 });
    expect(written.dealHealthUpdatedAt).toBeInstanceOf(Date);

    // Narrative has no column, so it must survive on the timeline.
    expect(mockDb.psTimelineEvent.create).toHaveBeenCalled();
    const timeline = mockDb.psTimelineEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(timeline.type).toBe("deal-health-assessed");
    expect(timeline.payload).toMatchObject({ rationale: expect.any(String) });

    expect(mockDb.psAuditLog.create).toHaveBeenCalled();
  });

  it("passes the engagement's real signals to the assessor", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(openEngagement() as never);
    seedSignals();

    await DEAL_HEALTH(req(), { params: { id: "eng-1" } });

    expect(assessDealHealth).toHaveBeenCalledTimes(1);
    const signals = assessDealHealth.mock.calls[0][0];
    expect(signals).toMatchObject({
      stage: "proposal",
      daysInStage: 42,
      requirementCount: 30,
      gapCount: 4,
      proposalCount: 1,
      latestProposalStatus: "internal-review",
      recentActivityCount: 3,
    });
    // Paise on the row, rupees to the model.
    expect(signals.estRevenue).toBe(5_000_000);
    // Stage label resolved, not the raw slug.
    expect(signals.stageLabel).not.toBe("proposal");
  });

  it("still records a stub assessment so an unconfigured environment is visible", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(openEngagement() as never);
    seedSignals();
    assessDealHealth.mockResolvedValue({
      health: "amber",
      riskScore: 50,
      rationale: "Not assessed — AI is not configured for this environment.",
      risks: [],
      nextActions: [],
      tokensUsed: 0,
      isStub: true,
    });

    const res = await DEAL_HEALTH(req(), { params: { id: "eng-1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.isStub).toBe(true);
    // Never green on a failed assessment — an unscored deal must not read healthy.
    expect(body.data.health).toBe("amber");
    const audit = mockDb.psAuditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(audit.metadata).toMatchObject({ isStub: true });
  });
});
