import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

const runCopilot = vi.fn();
vi.mock("@/lib/ai/prompts/copilot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/prompts/copilot")>(
    "@/lib/ai/prompts/copilot",
  );
  return { ...actual, runCopilot: (...args: unknown[]) => runCopilot(...args) };
});

import { POST as COPILOT } from "@/app/api/engagements/[id]/copilot/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";
const PARAMS = { params: { id: "eng-1" } };

function post(body: unknown) {
  return new NextRequest(
    new Request("http://localhost:3015/api/engagements/eng-1/copilot", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function engagement(overrides: Record<string, unknown> = {}) {
  return {
    id: "eng-1",
    title: "Helios Health — patient data platform",
    stage: "demo",
    daysInStage: 19,
    industry: "Healthcare",
    territory: "US",
    competitors: ["Deloitte", "Cognizant"],
    techStack: ["AzureAI"],
    probability: 40,
    estRevenue: 48_000_000n,
    currency: "USD",
    expectedClose: new Date("2026-10-03"),
    aiDealHealth: "amber",
    riskScore: 55,
    winLoss: null,
    ...overrides,
  };
}

/** Seed the four context queries, in the order the route fans them out. */
function seedContext(opts: {
  rfps?: unknown[];
  proposals?: unknown[];
  estimates?: unknown[];
  events?: unknown[];
} = {}) {
  mockDb.psRfp.findMany.mockResolvedValue((opts.rfps ?? []) as never);
  mockDb.psProposal.findMany.mockResolvedValue((opts.proposals ?? []) as never);
  mockDb.psCostEstimate.findMany.mockResolvedValue((opts.estimates ?? []) as never);
  mockDb.psTimelineEvent.findMany.mockResolvedValue((opts.events ?? []) as never);
}

beforeEach(() => {
  resetMockDb();
  runCopilot.mockReset();
  runCopilot.mockResolvedValue({
    task: "summarise",
    answer: "The deal is at demo stage with commercial terms unconfirmed.",
    tokensUsed: 800,
    isStub: false,
  });
});

describe("POST /api/engagements/[id]/copilot", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await COPILOT(post({ task: "summarise" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s without the engagements view grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);
    const res = await COPILOT(post({ task: "summarise" }), PARAMS);
    expect(res.status).toBe(403);
    expect(runCopilot).not.toHaveBeenCalled();
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null as never);

    const res = await COPILOT(post({ task: "summarise" }), PARAMS);

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_B,
      deletedAt: null,
    });
  });

  it("rejects an unknown task", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await COPILOT(post({ task: "hack-the-mainframe" }), PARAMS);
    expect(res.status).toBe(400);
    expect(runCopilot).not.toHaveBeenCalled();
  });

  it("requires a question for the ask task", async () => {
    // Without this, `ask` silently becomes a generic summary.
    setSession({ id: USER, orgId: ORG_A });

    const empty = await COPILOT(post({ task: "ask" }), PARAMS);
    expect(empty.status).toBe(400);

    const tooShort = await COPILOT(post({ task: "ask", question: "hi" }), PARAMS);
    expect(tooShort.status).toBe(400);
  });

  it("assembles the deal's real data into the context it passes the model", async () => {
    // The whole value is here: without this context the copilot is a generic
    // chatbot that cannot answer "why is this deal stalled".
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext({
      rfps: [
        {
          extractedText: "Customer needs a patient 360 view.",
          requirements: [
            { text: "HIPAA compliance", complianceStatus: "compliant", responseText: "Met natively" },
            { text: "What is the budget?", complianceStatus: "gap", responseText: null },
          ],
        },
      ],
      proposals: [
        {
          title: "Helios proposal",
          status: "customer-review",
          currentVersion: {
            sections: [
              { slug: "a", title: "A", html: "<p>done</p>" },
              { slug: "b", title: "B", html: "" },
            ],
          },
        },
      ],
      estimates: [{ title: "Discovery estimate", status: "draft", totalAmount: 3_000_000n, currency: "USD" }],
      events: [
        {
          type: "demo-delivered",
          summary: "Delivered demo",
          payload: { demoTitle: "Azure AI demo", outcome: "positive", feedbackScore: 4 },
          createdAt: new Date(Date.now() - 2 * 86_400_000),
        },
      ],
    });

    await COPILOT(post({ task: "summarise" }), PARAMS);

    const ctx = runCopilot.mock.calls[0][1];
    expect(ctx).toMatchObject({
      title: "Helios Health — patient data platform",
      stageLabel: "Demo",
      daysInStage: 19,
      competitors: ["Deloitte", "Cognizant"],
      requirementBrief: "Customer needs a patient 360 view.",
    });
    // Money converted from minor units using the record's currency.
    expect(ctx.estRevenueMajor).toBe(480_000);
    expect(ctx.estimates[0].totalMajor).toBe(30_000);
    // Proposal completeness is computed, not stored.
    expect(ctx.proposals[0]).toMatchObject({ sectionsFilled: 1, sectionsTotal: 2 });
    // Demo outcomes are reconstructed from the timeline payload.
    expect(ctx.demoDeliveries[0]).toMatchObject({ title: "Azure AI demo", outcome: "positive", score: 4 });
    expect(ctx.requirements).toHaveLength(2);
  });

  it("reports what the answer was grounded in", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext({
      rfps: [
        {
          extractedText: "brief",
          requirements: [
            { text: "q1", complianceStatus: "gap", responseText: "answered" },
            { text: "q2", complianceStatus: "gap", responseText: null },
          ],
        },
      ],
    });

    const body = await (await COPILOT(post({ task: "summarise" }), PARAMS)).json();

    // Surfaced so a thin answer is explainable rather than mysterious.
    expect(body.data.grounding).toMatchObject({
      requirements: 2,
      answeredRequirements: 1,
      hasRequirementBrief: true,
      proposals: 0,
    });
  });

  it("audits the call without storing the question text", async () => {
    // Questions can carry customer-confidential phrasing, and the audit trail is
    // read far more widely than the deal itself.
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext();

    await COPILOT(post({ task: "ask", question: "Why has the CTO gone quiet since the pricing call?" }), PARAMS);

    const audit = mockDb.psAuditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(audit.action).toBe("copilot.ask");
    expect(JSON.stringify(audit.metadata)).not.toContain("CTO");
    expect(audit.metadata).toMatchObject({ task: "ask" });
  });

  it("never writes to the timeline — a question is not a deal milestone", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext();

    await COPILOT(post({ task: "summarise" }), PARAMS);

    expect(mockDb.psTimelineEvent.create).not.toHaveBeenCalled();
  });

  it("passes the question through for the ask task", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext();

    await COPILOT(post({ task: "ask", question: "What is blocking this deal?" }), PARAMS);

    expect(runCopilot.mock.calls[0][0]).toBe("ask");
    expect(runCopilot.mock.calls[0][2]).toBe("What is blocking this deal?");
  });

  it("surfaces the stub flag when AI is unconfigured", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue(engagement() as never);
    seedContext();
    runCopilot.mockResolvedValue({
      task: "summarise",
      answer: "The copilot is unavailable because no AI key is configured.",
      tokensUsed: 0,
      isStub: true,
    });

    const body = await (await COPILOT(post({ task: "summarise" }), PARAMS)).json();

    expect(body.data.isStub).toBe(true);
  });
});
