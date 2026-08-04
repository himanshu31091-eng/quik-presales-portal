import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

/** The AI collaborator is mocked; these tests assert the route's behaviour. */
const evaluateRequirement = vi.fn();
vi.mock("@/lib/ai/prompts/evaluate-requirement", () => ({
  evaluateRequirement: (...args: unknown[]) => evaluateRequirement(...args),
}));

import { POST as SUBMIT, GET as QUEUE } from "@/app/api/leads/route";
import { POST as DECIDE } from "@/app/api/leads/[id]/decision/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

const BRIEF =
  "Customer wants to replace their ageing on-premise ERP across four plants in India. " +
  "They mentioned Dynamics 365 and asked about a phased cutover.";

function post(path: string, body: unknown) {
  return new NextRequest(
    new Request(`http://localhost:3015${path}`, { method: "POST", body: JSON.stringify(body) }),
  );
}

const NO_PARAMS = { params: {} };
const LEAD_PARAMS = { params: { id: "eng-1" } };

function readyEvaluation() {
  return {
    verdict: "ready",
    completenessPct: 88,
    summary: "Brief is workable.",
    gaps: [],
    assumedScope: ["Four-plant ERP replacement"],
    tokensUsed: 900,
    isStub: false,
  };
}

function gappyEvaluation() {
  return {
    verdict: "needs-info",
    completenessPct: 35,
    summary: "Scale and budget are missing.",
    gaps: [
      { topic: "Budget", question: "What budget range is approved?", why: "No figure given", blocking: true },
      { topic: "Scale", question: "How many users per plant?", why: "No volumes given", blocking: true },
      { topic: "Timeline", question: "Is there a hard go-live date?", blocking: false },
    ],
    assumedScope: [],
    tokensUsed: 1200,
    isStub: false,
  };
}

/** A lead engagement with the requirement rows the decision gate inspects. */
function leadEngagement(requirements: { complianceStatus: string; responseText: string | null }[]) {
  return {
    id: "eng-1",
    title: "Acme ERP replacement",
    stage: "lead",
    closedStatus: "open",
    estRevenue: 45_000_000n,
    rfps: [{ requirements }],
  };
}

beforeEach(() => {
  resetMockDb();
  evaluateRequirement.mockReset();
  evaluateRequirement.mockResolvedValue(readyEvaluation());
  mockDb.psEngagement.create.mockResolvedValue({ id: "eng-1", title: "Acme ERP replacement" } as never);
  mockDb.psRfp.create.mockResolvedValue({ id: "rfp-1" } as never);
});

describe("POST /api/leads — intake", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s without the engagements create grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);
    const res = await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);
    expect(res.status).toBe(403);
    expect(evaluateRequirement).not.toHaveBeenCalled();
  });

  it("rejects a brief too short to evaluate", async () => {
    // The intake exists to catch thin briefs; accepting "need a CRM" defeats it.
    setSession({ id: USER, orgId: ORG_A });
    const res = await SUBMIT(post("/api/leads", { title: "Acme", requirement: "need a CRM" }), NO_PARAMS);
    expect(res.status).toBe(400);
    expect(mockDb.psEngagement.create).not.toHaveBeenCalled();
  });

  it("creates the lead at stage `lead` and returns the assessment inline", async () => {
    setSession({ id: USER, orgId: ORG_A });

    const res = await SUBMIT(
      post("/api/leads", { title: "Acme ERP replacement", requirement: BRIEF, industry: "Manufacturing" }),
      NO_PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.stage).toBe("lead");
    expect(body.data.evaluation.verdict).toBe("ready");
    // Sales sees the result in the same interaction — there is no notification
    // system to fall back on.
    expect(body.data.evaluation.completenessPct).toBe(88);

    const created = mockDb.psEngagement.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(created).toMatchObject({ orgId: ORG_A, stage: "lead", salesOwnerId: USER });
  });

  it("stores the brief as the RFP's extracted text", async () => {
    setSession({ id: USER, orgId: ORG_A });
    await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);

    const rfp = mockDb.psRfp.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(rfp.extractedText).toBe(BRIEF);
    expect(rfp.engagementId).toBe("eng-1");
  });

  it("writes each gap as a requirement row, blockers as `gap`", async () => {
    // Reusing PsRfpRequirement is what lets sales answer inline and lets the
    // decision gate count outstanding blockers.
    setSession({ id: USER, orgId: ORG_A });
    evaluateRequirement.mockResolvedValue(gappyEvaluation());

    await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);

    const rows = (mockDb.psRfpRequirement.createMany.mock.calls[0][0]?.data ?? []) as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.complianceStatus === "gap")).toHaveLength(2);
    expect(rows.filter((r) => r.complianceStatus === "clarify")).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "Budget", aiGenerated: true });
  });

  it("creates no requirement rows when the brief is already workable", async () => {
    setSession({ id: USER, orgId: ORG_A });
    await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);
    expect(mockDb.psRfpRequirement.createMany).not.toHaveBeenCalled();
  });

  it("records the submission on the timeline and audit trail", async () => {
    setSession({ id: USER, orgId: ORG_A });
    evaluateRequirement.mockResolvedValue(gappyEvaluation());

    await SUBMIT(post("/api/leads", { title: "Acme", requirement: BRIEF }), NO_PARAMS);

    const event = mockDb.psTimelineEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.type).toBe("lead-submitted");
    expect(event.payload).toMatchObject({ verdict: "needs-info", blockers: 2 });
    expect(mockDb.psAuditLog.create).toHaveBeenCalled();
  });
});

describe("GET /api/leads — the pre-sales queue", () => {
  it("derives readiness from unanswered blockers rather than storing it", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findMany.mockResolvedValue([
      {
        id: "eng-1", title: "Ready lead", industry: null, territory: null, salesOwnerId: USER,
        estRevenue: null, currency: "INR", createdAt: new Date("2026-08-01"),
        rfps: [{ id: "rfp-1", requirements: [{ id: "r1", complianceStatus: "gap", responseText: "Answered" }] }],
      },
      {
        id: "eng-2", title: "Blocked lead", industry: null, territory: null, salesOwnerId: USER,
        estRevenue: null, currency: "INR", createdAt: new Date("2026-08-02"),
        rfps: [{ id: "rfp-2", requirements: [
          { id: "r2", complianceStatus: "gap", responseText: null },
          { id: "r3", complianceStatus: "clarify", responseText: null },
        ] }],
      },
    ] as never);
    mockDb.psEngagement.count.mockResolvedValue(2 as never);

    const res = await QUEUE(new NextRequest(new Request("http://localhost:3015/api/leads")), NO_PARAMS);
    const body = await res.json();

    expect(body.data.data[0]).toMatchObject({ title: "Ready lead", blockerCount: 1, blockersAnswered: 1, readyForReview: true });
    // Only `gap` rows block; an unanswered `clarify` does not hold the lead up.
    expect(body.data.data[1]).toMatchObject({ title: "Blocked lead", blockerCount: 1, blockersAnswered: 0, readyForReview: false });
  });

  it("only lists engagements still at the lead stage, scoped to the org", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findMany.mockResolvedValue([] as never);
    mockDb.psEngagement.count.mockResolvedValue(0 as never);

    await QUEUE(new NextRequest(new Request("http://localhost:3015/api/leads")), NO_PARAMS);

    expect(mockDb.psEngagement.findMany.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_B,
      stage: "lead",
      deletedAt: null,
    });
  });
});

describe("POST /api/leads/[id]/decision", () => {
  it("403s without the approve grant, so sales cannot decide its own lead", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);
    const res = await DECIDE(post("/api/leads/eng-1/decision", { decision: "accept" }), LEAD_PARAMS);
    expect(res.status).toBe(403);
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null as never);
    const res = await DECIDE(post("/api/leads/eng-1/decision", { decision: "accept" }), LEAD_PARAMS);
    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
  });

  it("409s when the engagement has already passed the lead gate", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({ ...leadEngagement([]), stage: "discovery" } as never);
    const res = await DECIDE(post("/api/leads/eng-1/decision", { decision: "accept" }), LEAD_PARAMS);
    expect(res.status).toBe(409);
    expect(mockDb.psEngagement.update).not.toHaveBeenCalled();
  });

  it("refuses to accept while blocking questions are unanswered", async () => {
    // The gate's whole purpose: pre-sales should not inherit an incomplete brief.
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(
      leadEngagement([{ complianceStatus: "gap", responseText: null }]) as never,
    );

    const res = await DECIDE(post("/api/leads/eng-1/decision", { decision: "accept" }), LEAD_PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/unanswered/i);
    expect(mockDb.psEngagement.update).not.toHaveBeenCalled();
  });

  it("accepts anyway when the override is set, and records that it was overridden", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(
      leadEngagement([{ complianceStatus: "gap", responseText: null }]) as never,
    );

    const res = await DECIDE(
      post("/api/leads/eng-1/decision", { decision: "accept", overrideOpenBlockers: true }),
      LEAD_PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.overriddenBlockers).toBe(1);
    const event = mockDb.psTimelineEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.payload).toMatchObject({ overridden: true });
  });

  it("moves an accepted lead into qualification", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(
      leadEngagement([{ complianceStatus: "gap", responseText: "Answered" }]) as never,
    );

    const res = await DECIDE(post("/api/leads/eng-1/decision", { decision: "accept" }), LEAD_PARAMS);

    expect(res.status).toBe(200);
    const written = mockDb.psEngagement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(written).toMatchObject({ stage: "qualification", closedStatus: "open", presalesOwnerId: USER });
  });

  it("requires a category and an explanation to reject", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(leadEngagement([]) as never);

    const noReason = await DECIDE(post("/api/leads/eng-1/decision", { decision: "reject" }), LEAD_PARAMS);
    expect(noReason.status).toBe(400);

    const thinReason = await DECIDE(
      post("/api/leads/eng-1/decision", { decision: "reject", reasonCategory: "no-capacity", reasonText: "no" }),
      LEAD_PARAMS,
    );
    expect(thinReason.status).toBe(400);
  });

  it("rejects an unknown reason category, so the field stays countable", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(leadEngagement([]) as never);

    const res = await DECIDE(
      post("/api/leads/eng-1/decision", { decision: "reject", reasonCategory: "just-because", reasonText: "Not interested at all" }),
      LEAD_PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it("records a rejection as `rejected`, not `lost`, so win rate is unaffected", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(leadEngagement([]) as never);
    mockDb.psWinLoss.findFirst.mockResolvedValue(null as never);

    const res = await DECIDE(
      post("/api/leads/eng-1/decision", {
        decision: "reject",
        reasonCategory: "budget-too-low",
        reasonText: "Budget is a quarter of the viable floor for four plants.",
      }),
      LEAD_PARAMS,
    );

    expect(res.status).toBe(200);
    const written = mockDb.psEngagement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(written).toMatchObject({ stage: "rejected", closedStatus: "rejected", probability: 0 });

    // The reason is queryable alongside win/loss, with its own outcome value.
    const winLoss = mockDb.psWinLoss.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(winLoss).toMatchObject({ outcome: "rejected", reasonCategory: "budget-too-low" });
  });
});
