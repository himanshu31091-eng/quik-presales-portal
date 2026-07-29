import { describe, it, expect, vi } from "vitest";

// Mock @quikit/database so importing apiLogging doesn't try to instantiate
// the Prisma client (which needs DATABASE_URL).
vi.mock("@quikit/database", () => ({
  db: {
    apiCall: { create: vi.fn().mockResolvedValue({}) },
  },
}));

// Pure utilities — the only thing we can test without a real DB.
import { normalizePathPattern, statusClassOf, logApiCall } from "../lib/apiLogging";

describe("normalizePathPattern", () => {
  it("replaces CUID segments with [id]", () => {
    expect(normalizePathPattern("/api/kpi/ckabc123def456ghi789jkl01"))
      .toBe("/api/kpi/[id]");
    expect(normalizePathPattern("/api/kpi/ckabc123def456ghi789jkl01/weekly"))
      .toBe("/api/kpi/[id]/weekly");
  });

  it("replaces UUID segments with [id]", () => {
    expect(normalizePathPattern("/api/teams/550e8400-e29b-41d4-a716-446655440000"))
      .toBe("/api/teams/[id]");
  });

  it("replaces numeric segments with [id]", () => {
    expect(normalizePathPattern("/api/users/42")).toBe("/api/users/[id]");
    expect(normalizePathPattern("/api/users/42/permissions")).toBe("/api/users/[id]/permissions");
  });

  it("leaves non-id segments unchanged", () => {
    expect(normalizePathPattern("/api/health")).toBe("/api/health");
    expect(normalizePathPattern("/api/kpi/teams")).toBe("/api/kpi/teams");
  });

  it("strips query string and trailing slash", () => {
    expect(normalizePathPattern("/api/kpi?year=2026")).toBe("/api/kpi");
    expect(normalizePathPattern("/api/kpi/")).toBe("/api/kpi");
  });

  it("handles root path", () => {
    expect(normalizePathPattern("/")).toBe("/");
    expect(normalizePathPattern("")).toBe("/");
  });

  it("does not treat short alphanumeric segments as ids", () => {
    // "admin" and "kpi" must NOT be normalized — they're route names.
    expect(normalizePathPattern("/api/admin/kpi")).toBe("/api/admin/kpi");
  });
});

describe("statusClassOf", () => {
  it("bins 2xx", () => {
    expect(statusClassOf(200)).toBe("2xx");
    expect(statusClassOf(201)).toBe("2xx");
    expect(statusClassOf(299)).toBe("2xx");
  });
  it("bins 3xx", () => {
    expect(statusClassOf(301)).toBe("3xx");
    expect(statusClassOf(304)).toBe("3xx");
  });
  it("bins 4xx", () => {
    expect(statusClassOf(400)).toBe("4xx");
    expect(statusClassOf(404)).toBe("4xx");
    expect(statusClassOf(429)).toBe("4xx");
  });
  it("bins 5xx", () => {
    expect(statusClassOf(500)).toBe("5xx");
    expect(statusClassOf(502)).toBe("5xx");
  });
  it("buckets unknown codes as other", () => {
    expect(statusClassOf(100)).toBe("other");
    expect(statusClassOf(699)).toBe("other");
  });
});

describe("logApiCall (fire-and-forget)", () => {
  it("never throws even if the DB layer errors", async () => {
    const { db } = await import("@quikit/database");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.apiCall.create as any).mockRejectedValueOnce(new Error("boom"));

    // Should not throw — the helper catches internally.
    await expect(
      logApiCall({
        appSlug: "quikit",
        method: "GET",
        path: "/api/test",
        statusCode: 200,
        durationMs: 5,
      }),
    ).resolves.toBeUndefined();
  });
});
