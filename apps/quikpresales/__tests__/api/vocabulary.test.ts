import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET } from "@/app/api/vocabulary/route";
import { INDUSTRIES, TECHNOLOGIES } from "@/lib/library/constants";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req() {
  return new NextRequest(new Request("http://localhost:3015/api/vocabulary"));
}

/** Seed the four distinct-value queries, in the order the route fans them out. */
function seed(opts: {
  engagements?: { industry: string | null }[];
  demos?: { industry: string | null; technology: string | null }[];
  knowledge?: { industry: string | null; technology: string | null }[];
  templates?: { industry: string | null; technology: string | null }[];
} = {}) {
  mockDb.psEngagement.findMany.mockResolvedValue((opts.engagements ?? []) as never);
  mockDb.psDemo.findMany.mockResolvedValue((opts.demos ?? []) as never);
  mockDb.psKnowledgeAsset.findMany.mockResolvedValue((opts.knowledge ?? []) as never);
  mockDb.psTemplate.findMany.mockResolvedValue((opts.templates ?? []) as never);
}

beforeEach(() => {
  resetMockDb();
});

describe("GET /api/vocabulary", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns the seed suggestions when the org has saved nothing yet", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed();

    const body = await (await GET(req(), { params: {} })).json();

    expect(body.success).toBe(true);
    for (const industry of INDUSTRIES) expect(body.data.industries).toContain(industry);
    for (const tech of TECHNOLOGIES) expect(body.data.technologies).toContain(tech);
  });

  it("includes values the org invented, merged with the seed list", async () => {
    // The whole point: type "Telecom" once and it is offered from then on.
    setSession({ id: USER, orgId: ORG_A });
    seed({
      engagements: [{ industry: "Telecom" }],
      demos: [{ industry: "Hospitality", technology: "Snowflake" }],
    });

    const body = await (await GET(req(), { params: {} })).json();

    expect(body.data.industries).toContain("Telecom");
    expect(body.data.industries).toContain("Hospitality");
    expect(body.data.technologies).toContain("Snowflake");
    // Seed values survive alongside them.
    expect(body.data.industries).toContain("Manufacturing");
  });

  it("dedupes case-insensitively, keeping the first spelling seen", async () => {
    // "manufacturing" typed by hand must not appear beside the seeded
    // "Manufacturing" as a second, near-identical option.
    setSession({ id: USER, orgId: ORG_A });
    seed({ engagements: [{ industry: "manufacturing" }] });

    const body = await (await GET(req(), { params: {} })).json();
    const matches = body.data.industries.filter(
      (i: string) => i.toLowerCase() === "manufacturing",
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe("Manufacturing");
  });

  it("drops blank and whitespace-only values from older rows", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({
      engagements: [{ industry: "   " }, { industry: null }],
      demos: [{ industry: "", technology: "  " }],
    });

    const body = await (await GET(req(), { params: {} })).json();

    expect(body.data.industries.every((i: string) => i.trim() !== "")).toBe(true);
    expect(body.data.technologies.every((t: string) => t.trim() !== "")).toBe(true);
  });

  it("trims stored values so ` Retail` and `Retail` are one option", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({ engagements: [{ industry: "  Retail  " }] });

    const body = await (await GET(req(), { params: {} })).json();

    expect(body.data.industries.filter((i: string) => i === "Retail")).toHaveLength(1);
    expect(body.data.industries).not.toContain("  Retail  ");
  });

  it("returns values sorted, so the suggestion order is stable", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({ engagements: [{ industry: "Aviation" }, { industry: "Zoology" }] });

    const body = await (await GET(req(), { params: {} })).json();
    const sorted = [...body.data.industries].sort((a: string, b: string) => a.localeCompare(b));

    expect(body.data.industries).toEqual(sorted);
  });

  it("scopes every query to the caller's org", async () => {
    // A term invented by another tenant must never be suggested here.
    setSession({ id: USER, orgId: ORG_B });
    seed();

    await GET(req(), { params: {} });

    for (const model of [
      mockDb.psEngagement,
      mockDb.psDemo,
      mockDb.psKnowledgeAsset,
      mockDb.psTemplate,
    ]) {
      expect(model.findMany.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
    }
  });
});
