import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

import { POST as CREATE } from "@/app/api/rfps/route";
import { POST as EXTRACT } from "@/app/api/rfps/[id]/extract/route";
import { PATCH as PATCH_REQ } from "@/app/api/rfps/[id]/requirements/[reqId]/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  resetMockDb();
});

describe("POST /api/rfps", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await CREATE(
      req("http://localhost:3015/api/rfps", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-1", title: "RFP" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("404s when the source document belongs to a different engagement", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({ id: "eng-1" } as never);
    // Document exists in the org but under another engagement — the query is
    // filtered on both, so it comes back null.
    mockDb.psDocument.findFirst.mockResolvedValue(null);

    const res = await CREATE(
      req("http://localhost:3015/api/rfps", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-1", title: "RFP", sourceDocId: "doc-other" }),
      }),
      { params: {} },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psDocument.findFirst.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_A,
      engagementId: "eng-1",
    });
    expect(mockDb.psRfp.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/rfps/[id]/extract", () => {
  it("409s when extraction is already running", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psRfp.findFirst.mockResolvedValue({
      id: "rfp-1",
      title: "RFP",
      status: "extracting",
      sourceDocId: "doc-1",
      engagementId: "eng-1",
      engagement: { title: "Acme" },
    } as never);

    const res = await EXTRACT(req("http://localhost:3015/api/rfps/rfp-1/extract", { method: "POST" }), {
      params: { id: "rfp-1" },
    });

    expect(res.status).toBe(409);
    // Must not claim the job a second time.
    expect(mockDb.psRfp.update).not.toHaveBeenCalled();
  });

  it("400s when there is no source document", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psRfp.findFirst.mockResolvedValue({
      id: "rfp-1",
      title: "RFP",
      status: "uploaded",
      sourceDocId: null,
      engagementId: "eng-1",
      engagement: { title: "Acme" },
    } as never);

    const res = await EXTRACT(req("http://localhost:3015/api/rfps/rfp-1/extract", { method: "POST" }), {
      params: { id: "rfp-1" },
    });

    expect(res.status).toBe(400);
  });

  it("records the failure on the row instead of leaving it stuck in `extracting`", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psRfp.findFirst.mockResolvedValue({
      id: "rfp-1",
      title: "RFP",
      status: "uploaded",
      sourceDocId: "doc-1",
      engagementId: "eng-1",
      engagement: { title: "Acme" },
    } as never);
    mockDb.psDocument.findFirst.mockResolvedValue({
      blobUrl: "https://blob.example/x.pdf",
      mimeType: "application/pdf",
      filename: "x.pdf",
    } as never);

    // The blob fetch fails — the route must catch it and unwind the status.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    const res = await EXTRACT(req("http://localhost:3015/api/rfps/rfp-1/extract", { method: "POST" }), {
      params: { id: "rfp-1" },
    });

    expect(res.status).toBe(502);

    // First update claims the job; the last one records the failure.
    const updates = mockDb.psRfp.update.mock.calls.map(
      (c) => c[0].data as Record<string, unknown>,
    );
    expect(updates[0]).toMatchObject({ status: "extracting" });
    expect(updates[updates.length - 1]).toMatchObject({ status: "uploaded" });
    expect(updates[updates.length - 1].extractError).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psRfp.findFirst.mockResolvedValue(null);

    const res = await EXTRACT(req("http://localhost:3015/api/rfps/rfp-1/extract", { method: "POST" }), {
      params: { id: "rfp-1" },
    });

    expect(res.status).toBe(404);
    expect(mockDb.psRfp.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
  });
});

describe("PATCH /api/rfps/[id]/requirements/[reqId]", () => {
  it("403s without the update grant", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);

    const res = await PATCH_REQ(
      req("http://localhost:3015/api/rfps/rfp-1/requirements/req-1", {
        method: "PATCH",
        body: JSON.stringify({ complianceStatus: "compliant" }),
      }),
      { params: { id: "rfp-1", reqId: "req-1" } },
    );

    expect(res.status).toBe(403);
  });

  it("flips the RFP to `responded` once every requirement is answered", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psRfpRequirement.findFirst.mockResolvedValue({
      id: "req-1",
      rfp: { id: "rfp-1", status: "extracted" },
    } as never);
    mockDb.psRfpRequirement.update.mockResolvedValue({ id: "req-1" } as never);
    // No outstanding, three total → responded.
    mockDb.psRfpRequirement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);

    const res = await PATCH_REQ(
      req("http://localhost:3015/api/rfps/rfp-1/requirements/req-1", {
        method: "PATCH",
        body: JSON.stringify({ responseText: "We comply." }),
      }),
      { params: { id: "rfp-1", reqId: "req-1" } },
    );

    expect(res.status).toBe(200);
    expect(mockDb.psRfp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "responded" }) }),
    );
  });

  it("never walks a submitted RFP back to `responded`", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psRfpRequirement.findFirst.mockResolvedValue({
      id: "req-1",
      rfp: { id: "rfp-1", status: "submitted" },
    } as never);
    mockDb.psRfpRequirement.update.mockResolvedValue({ id: "req-1" } as never);
    mockDb.psRfpRequirement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);

    await PATCH_REQ(
      req("http://localhost:3015/api/rfps/rfp-1/requirements/req-1", {
        method: "PATCH",
        body: JSON.stringify({ responseText: "Edited after submission." }),
      }),
      { params: { id: "rfp-1", reqId: "req-1" } },
    );

    expect(mockDb.psRfp.update).not.toHaveBeenCalled();
  });

  it("404s when the requirement belongs to another org", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psRfpRequirement.findFirst.mockResolvedValue(null);

    const res = await PATCH_REQ(
      req("http://localhost:3015/api/rfps/rfp-1/requirements/req-1", {
        method: "PATCH",
        body: JSON.stringify({ complianceStatus: "gap" }),
      }),
      { params: { id: "rfp-1", reqId: "req-1" } },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psRfpRequirement.findFirst.mock.calls[0][0]?.where).toMatchObject({
      orgId: ORG_B,
    });
  });
});
