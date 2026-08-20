import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

import { GET, POST } from "@/app/api/engagements/route";
import { POST as TRANSITION } from "@/app/api/engagements/[id]/transition/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  resetMockDb();
});

describe("GET /api/engagements", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("http://localhost:3015/api/engagements"), { params: {} });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it("returns 403 when the user lacks the view grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);
    const res = await GET(req("http://localhost:3015/api/engagements"), { params: {} });
    expect(res.status).toBe(403);
  });

  it("scopes every query to the caller's org", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findMany.mockResolvedValue([]);
    mockDb.psEngagement.count.mockResolvedValue(0);

    const res = await GET(req("http://localhost:3015/api/engagements"), { params: {} });
    expect(res.status).toBe(200);

    // Cross-org isolation: the org filter is not optional or caller-supplied.
    const where = mockDb.psEngagement.findMany.mock.calls[0][0]?.where;
    expect(where).toMatchObject({ orgId: ORG_A, deletedAt: null });
    expect(mockDb.psEngagement.count.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_A });
  });

  it("rejects an unknown stage filter with 400", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await GET(req("http://localhost:3015/api/engagements?stage=bogus"), {
      params: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/engagements", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await POST(
      req("http://localhost:3015/api/engagements", {
        method: "POST",
        body: JSON.stringify({ title: "Anything" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("rejects a title shorter than two characters", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await POST(
      req("http://localhost:3015/api/engagements", {
        method: "POST",
        body: JSON.stringify({ title: "x" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(400);
  });

  it("creates with the caller's orgId, and writes timeline + audit in the transaction", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.create.mockResolvedValue({
      id: "eng-1",
      title: "Acme migration",
      stage: "qualification",
      estRevenue: null,
    } as never);

    const res = await POST(
      req("http://localhost:3015/api/engagements", {
        method: "POST",
        body: JSON.stringify({ title: "Acme migration", estRevenue: "500000" }),
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);

    const data = mockDb.psEngagement.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.orgId).toBe(ORG_A);
    expect(data.createdBy).toBe(USER);
    // Money crosses the wire as a string and is stored as BigInt paise.
    expect(data.estRevenue).toBe(500_000n);

    expect(mockDb.psTimelineEvent.create).toHaveBeenCalledOnce();
    expect(mockDb.psAuditLog.create).toHaveBeenCalledOnce();
    const audit = mockDb.psAuditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(audit).toMatchObject({ orgId: ORG_A, userId: USER, action: "engagement.create" });
  });

  it("serialises BigInt money back out as a string", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.create.mockResolvedValue({
      id: "eng-1",
      title: "Acme",
      estRevenue: 500_000n,
    } as never);

    const res = await POST(
      req("http://localhost:3015/api/engagements", {
        method: "POST",
        body: JSON.stringify({ title: "Acme", estRevenue: "500000" }),
      }),
      { params: {} },
    );

    const body = (await res.json()) as { data: { estRevenue: string } };
    expect(body.data.estRevenue).toBe("500000");
  });
});

describe("POST /api/engagements/[id]/transition", () => {
  it("404s for an engagement in another org", async () => {
    setSession({ id: USER, orgId: ORG_A });
    // findFirst is org-filtered, so another org's row simply isn't found.
    mockDb.psEngagement.findFirst.mockResolvedValue(null);

    const res = await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-in-org-b/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "discovery" }),
      }),
      { params: { id: "eng-in-org-b" } },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_A });
    expect(mockDb.psEngagement.update).not.toHaveBeenCalled();
  });

  it("409s when the engagement is already closed", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({
      id: "eng-1",
      title: "Acme",
      stage: "won",
      closedStatus: "won",
    } as never);

    const res = await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "proposal" }),
      }),
      { params: { id: "eng-1" } },
    );

    expect(res.status).toBe(409);
    expect(mockDb.psEngagement.update).not.toHaveBeenCalled();
  });

  it("400s on a backward move", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({
      id: "eng-1",
      title: "Acme",
      stage: "proposal",
      closedStatus: "open",
    } as never);

    const res = await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "discovery" }),
      }),
      { params: { id: "eng-1" } },
    );

    expect(res.status).toBe(400);
  });

  it("advances forward and records the move", async () => {
    setSession({ id: USER, orgId: ORG_A });
    // Moving into "discovery" is checklist-gated (industry + estRevenue must be
    // set) — the same findFirst mock backs both the transition handler's own
    // lookup and evaluateChecklist's, so it must satisfy both.
    mockDb.psEngagement.findFirst.mockResolvedValue({
      id: "eng-1",
      title: "Acme",
      stage: "qualification",
      closedStatus: "open",
      industry: "Manufacturing",
      estRevenue: 5_000_000n,
    } as never);

    const res = await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "discovery" }),
      }),
      { params: { id: "eng-1" } },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: { fromStage: "qualification", toStage: "discovery" },
    });

    const update = mockDb.psEngagement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update).toMatchObject({ stage: "discovery", closedStatus: "open", daysInStage: 0 });
    expect(mockDb.psTimelineEvent.create).toHaveBeenCalledOnce();
    expect(mockDb.psAuditLog.create).toHaveBeenCalledOnce();
  });

  it("sets closedStatus when moving to won", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({
      id: "eng-1",
      title: "Acme",
      stage: "negotiation",
      closedStatus: "open",
    } as never);

    await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "won" }),
      }),
      { params: { id: "eng-1" } },
    );

    const update = mockDb.psEngagement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update).toMatchObject({ stage: "won", closedStatus: "won", probability: 100 });
  });

  it("never lets an org read across the tenant boundary", async () => {
    // Same id, different caller org — the where clause must carry ORG_B.
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null);

    await TRANSITION(
      req("http://localhost:3015/api/engagements/eng-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStage: "discovery" }),
      }),
      { params: { id: "eng-1" } },
    );

    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
  });
});
