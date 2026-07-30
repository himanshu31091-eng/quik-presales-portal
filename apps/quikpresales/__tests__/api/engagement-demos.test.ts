import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

import { POST as LOG, GET as LIST } from "@/app/api/engagements/[id]/demos/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function post(body: unknown) {
  return new NextRequest(
    new Request("http://localhost:3015/api/engagements/eng-1/demos", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function get() {
  return new NextRequest(
    new Request("http://localhost:3015/api/engagements/eng-1/demos", { method: "GET" }),
  );
}

const PARAMS = { params: { id: "eng-1" } };

function engagementExists() {
  mockDb.psEngagement.findFirst.mockResolvedValue({ id: "eng-1", title: "Acme ERP" } as never);
}

/** A library asset already carrying two ratings averaging 4.0. */
function libraryDemo(overrides: Record<string, unknown> = {}) {
  mockDb.psDemo.findFirst.mockResolvedValue({
    id: "demo-1",
    title: "Dynamics365 Finance walkthrough",
    technology: "Dynamics365",
    feedbackScore: 4,
    feedbackCount: 2,
    ...overrides,
  } as never);
}

beforeEach(() => {
  resetMockDb();
});

describe("POST /api/engagements/[id]/demos", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await LOG(post({ outcome: "positive" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s without the engagements update grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);
    const res = await LOG(post({ outcome: "positive" }), PARAMS);
    expect(res.status).toBe(403);
    expect(mockDb.psTimelineEvent.create).not.toHaveBeenCalled();
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null as never);

    const res = await LOG(post({ outcome: "positive" }), PARAMS);

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_B,
      deletedAt: null,
    });
  });

  it("404s when the referenced library demo belongs to another org", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    mockDb.psDemo.findFirst.mockResolvedValue(null as never);

    const res = await LOG(post({ demoId: "demo-other" }), PARAMS);

    expect(res.status).toBe(404);
    expect(mockDb.psDemo.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_A });
    expect(mockDb.psTimelineEvent.create).not.toHaveBeenCalled();
  });

  it("writes the `demo-delivered` event the weekly report counts", async () => {
    // Regression: the weekly executive report reads eventMap["demo-delivered"]
    // but nothing in the app ever wrote that event, so "demos delivered" was
    // permanently 0. This route is its only writer — the type must not drift.
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();

    const res = await LOG(post({ technology: "AzureAI", outcome: "positive" }), PARAMS);

    expect(res.status).toBe(201);
    expect(mockDb.psTimelineEvent.create).toHaveBeenCalled();
    const event = mockDb.psTimelineEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.type).toBe("demo-delivered");
    expect(event.engagementId).toBe("eng-1");
    expect(mockDb.psAuditLog.create).toHaveBeenCalled();
  });

  it("folds a new rating into the library asset's running average", async () => {
    // Two existing ratings averaging 4.0, plus a 5 → (4*2 + 5) / 3 = 4.33.
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    libraryDemo();

    const res = await LOG(post({ demoId: "demo-1", feedbackScore: 5 }), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.demoAverageScore).toBeCloseTo(4.33, 2);

    const update = mockDb.psDemo.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update.feedbackScore).toBeCloseTo(4.33, 2);
    expect(update.feedbackCount).toBe(3);
  });

  it("seeds the average from the first ever rating", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    libraryDemo({ feedbackScore: null, feedbackCount: 0 });

    const res = await LOG(post({ demoId: "demo-1", feedbackScore: 4 }), PARAMS);
    const body = await res.json();

    expect(body.data.demoAverageScore).toBe(4);
    const update = mockDb.psDemo.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update.feedbackCount).toBe(1);
  });

  it("does not touch the library when no rating was given", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    libraryDemo();

    await LOG(post({ demoId: "demo-1", outcome: "neutral" }), PARAMS);

    expect(mockDb.psDemo.update).not.toHaveBeenCalled();
  });

  it("rejects a future delivery date rather than skewing this week's counts", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const res = await LOG(post({ deliveredAt: tomorrow }), PARAMS);

    expect(res.status).toBe(400);
    expect(mockDb.psTimelineEvent.create).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range feedback score", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();

    const res = await LOG(post({ feedbackScore: 9 }), PARAMS);

    expect(res.status).toBe(400);
    expect(mockDb.psTimelineEvent.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/engagements/[id]/demos", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await LIST(get(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("reconstructs deliveries from the timeline and summarises them", async () => {
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    mockDb.psTimelineEvent.findMany.mockResolvedValue([
      {
        id: "ev-1",
        summary: 'Delivered "Finance walkthrough" demo — rated 5/5',
        actorId: USER,
        createdAt: new Date("2026-07-20T10:00:00Z"),
        payload: {
          demoId: "demo-1",
          demoTitle: "Finance walkthrough",
          technology: "Dynamics365",
          deliveredAt: "2026-07-20T09:00:00Z",
          audience: ["CFO", "Finance Manager"],
          outcome: "positive",
          feedbackScore: 5,
        },
      },
      {
        id: "ev-2",
        summary: "Delivered a AzureAI demo",
        actorId: USER,
        createdAt: new Date("2026-07-18T10:00:00Z"),
        payload: { outcome: "neutral", audience: [] },
      },
    ] as never);

    const res = await LIST(get(), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deliveries).toHaveLength(2);
    expect(body.data.deliveries[0]).toMatchObject({
      demoTitle: "Finance walkthrough",
      outcome: "positive",
      feedbackScore: 5,
      audience: ["CFO", "Finance Manager"],
    });
    // Only the rated delivery counts toward the average.
    expect(body.data.summary).toMatchObject({ total: 2, averageScore: 5 });
    expect(body.data.summary.byOutcome).toMatchObject({ positive: 1, neutral: 1 });

    // Must only read demo events, scoped to the org.
    expect(mockDb.psTimelineEvent.findMany.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_A,
      type: "demo-delivered",
    });
  });

  it("survives a malformed payload without throwing", async () => {
    // Timeline payload is free-form JSON written by older code paths, so every
    // field has to be treated as untrusted.
    setSession({ id: USER, orgId: ORG_A });
    engagementExists();
    mockDb.psTimelineEvent.findMany.mockResolvedValue([
      {
        id: "ev-3",
        summary: "legacy",
        actorId: null,
        createdAt: new Date("2026-07-01T10:00:00Z"),
        payload: { audience: "not-an-array", feedbackScore: "five", demoId: 42 },
      },
    ] as never);

    const res = await LIST(get(), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deliveries[0]).toMatchObject({
      audience: [],
      feedbackScore: null,
      demoId: null,
      outcome: "neutral",
    });
    expect(body.data.summary.averageScore).toBeNull();
  });
});
