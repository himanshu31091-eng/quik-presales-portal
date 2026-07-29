import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET as LIST, POST as CREATE } from "@/app/api/super/plans/route";
import { PATCH, DELETE } from "@/app/api/super/plans/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "plan-1" } };

// ─── GET /api/super/plans ────────────────────────────────────────────────────

describe("GET /api/super/plans", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await LIST(makeRequest("http://localhost:3006/api/super/plans"));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await LIST(makeRequest("http://localhost:3006/api/super/plans"));
    expect(res.status).toBe(403);
  });

  it("returns plans list on success", async () => {
    setSession(SUPER_ADMIN);
    const plans = [
      {
        id: "p-1",
        slug: "startup",
        name: "Startup",
        description: null,
        priceMonthly: 4900,
        priceYearly: 49000,
        currency: "USD",
        features: [],
        limits: null,
        isActive: true,
        sortOrder: 0,
      },
    ];
    mockDb.plan.findMany.mockResolvedValue(plans as never);
    (mockDb.org.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      [{ plan: "startup", _count: { plan: 3 } }],
    );

    const res = await LIST(makeRequest("http://localhost:3006/api/super/plans"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].tenantCount).toBe(3);
    expect(body.data[0].priceMonthlyDollars).toBe("49.00");
  });
});

// ─── POST /api/super/plans ───────────────────────────────────────────────────

describe("POST /api/super/plans", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/plans", {
        method: "POST",
        body: JSON.stringify({ slug: "growth", name: "Growth" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/plans", {
        method: "POST",
        body: JSON.stringify({ slug: "growth", name: "Growth" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when slug or name missing", async () => {
    setSession(SUPER_ADMIN);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/plans", {
        method: "POST",
        body: JSON.stringify({ slug: "", name: "" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 400 when slug format is invalid", async () => {
    setSession(SUPER_ADMIN);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/plans", {
        method: "POST",
        body: JSON.stringify({ slug: "BAD SLUG!", name: "Bad" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a plan and returns 201 on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.plan.findUnique.mockResolvedValue(null as never);
    const created = {
      id: "p-new",
      slug: "growth",
      name: "Growth",
      priceMonthly: 9900,
      priceYearly: 99000,
      currency: "USD",
      features: [],
      limits: null,
      isActive: true,
      sortOrder: 0,
    };
    mockDb.plan.create.mockResolvedValue(created as never);

    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/plans", {
        method: "POST",
        body: JSON.stringify({
          slug: "growth",
          name: "Growth",
          priceMonthly: 9900,
          priceYearly: 99000,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("p-new");
  });
});

// ─── PATCH /api/super/plans/[id] ─────────────────────────────────────────────

describe("PATCH /api/super/plans/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when plan not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.plan.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("updates a plan and returns 200 on success", async () => {
    setSession(SUPER_ADMIN);
    const existing = {
      id: "plan-1",
      slug: "startup",
      name: "Startup",
      priceMonthly: 4900,
      priceYearly: 49000,
      isActive: true,
    };
    mockDb.plan.findUnique.mockResolvedValue(existing as never);
    mockDb.plan.update.mockResolvedValue({ ...existing, name: "Startup Updated" } as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Startup Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Startup Updated");
  });
});

// ─── DELETE /api/super/plans/[id] ────────────────────────────────────────────

describe("DELETE /api/super/plans/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when plan not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.plan.findUnique.mockResolvedValue(null as never);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful delete", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "plan-1", slug: "startup", name: "Startup" };
    mockDb.plan.findUnique.mockResolvedValue(existing as never);
    mockDb.org.count.mockResolvedValue(0 as never);
    mockDb.plan.delete.mockResolvedValue(existing as never);

    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/plans/plan-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
  });
});
