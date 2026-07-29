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

import { GET as HEALTH_GET } from "@/app/api/super/org-health/[orgId]/route";
import { GET as OVERVIEW_GET } from "@/app/api/super/analytics/overview/route";

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3006"));
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const HEALTH_PARAMS = { params: { orgId: "tenant-1" } };

// ─── GET /api/super/org-health/[orgId] ─────────────────────────────────

describe("GET /api/super/org-health/[orgId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await HEALTH_GET(
      makeRequest("http://localhost:3006/api/super/org-health/tenant-1"),
      HEALTH_PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await HEALTH_GET(
      makeRequest("http://localhost:3006/api/super/org-health/tenant-1"),
      HEALTH_PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when tenant not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await HEALTH_GET(
      makeRequest("http://localhost:3006/api/super/org-health/tenant-1"),
      HEALTH_PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("returns tenant health data on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({
      id: "tenant-1",
      name: "Acme",
      slug: "acme",
      plan: "startup",
      status: "active",
      createdAt: new Date(),
    } as never);

    mockDb.orgMember.count.mockResolvedValue(5 as never);
    mockDb.sessionEvent.findMany.mockResolvedValue([
      { userId: "u-1" },
      { userId: "u-2" },
    ] as never);
    mockDb.sessionEvent.findFirst.mockResolvedValue({
      createdAt: new Date(),
      userId: "u-1",
    } as never);
    mockDb.kPI.count.mockResolvedValue(10 as never);
    mockDb.kPIWeeklyValue.count.mockResolvedValue(4 as never);
    mockDb.appModuleFlag.count.mockResolvedValue(0 as never);
    mockDb.orgAppAccess.count.mockResolvedValue(0 as never);
    mockDb.invoice.findFirst.mockResolvedValue({
      status: "paid",
      amountCents: 4900,
      currency: "USD",
      periodStart: new Date(),
      paidAt: new Date(),
      failedAt: null,
    } as never);
    mockDb.apiCall.count.mockResolvedValue(120 as never);
    mockDb.sessionEvent.count.mockResolvedValue(50 as never);

    const res = await HEALTH_GET(
      makeRequest("http://localhost:3006/api/super/org-health/tenant-1"),
      HEALTH_PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.org.id).toBe("tenant-1");
    expect(body.data.healthScore).toBeGreaterThan(0);
    expect(body.data.signals.memberCount).toBe(5);
    expect(body.data.signals.activeUserCount7d).toBe(2);
  });
});

// ─── GET /api/super/analytics/overview ───────────────────────────────────────

describe("GET /api/super/analytics/overview", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await OVERVIEW_GET(
      makeRequest("http://localhost:3006/api/super/analytics/overview"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await OVERVIEW_GET(
      makeRequest("http://localhost:3006/api/super/analytics/overview"),
    );
    expect(res.status).toBe(403);
  });

  it("returns overview data on success", async () => {
    setSession(SUPER_ADMIN);

    // tenant.count called twice (total + active status filter)
    mockDb.org.count
      .mockResolvedValueOnce(12 as never) // total
      .mockResolvedValueOnce(10 as never); // active
    mockDb.user.count.mockResolvedValue(50 as never);
    mockDb.app.count.mockResolvedValue(3 as never);
    mockDb.appHealthCheck.findMany.mockResolvedValue([
      { appId: "app-1", status: "up", statusCode: 200 },
      { appId: "app-2", status: "up", statusCode: 200 },
    ] as never);
    // apiCall.count called twice (total, errors)
    mockDb.apiCall.count
      .mockResolvedValueOnce(1000 as never)
      .mockResolvedValueOnce(20 as never);
    mockDb.sessionEvent.findMany.mockResolvedValue([
      { userId: "u-1", createdAt: new Date() },
    ] as never);
    // invoice.findMany called twice (current month, prev month)
    mockDb.invoice.findMany
      .mockResolvedValueOnce([
        { amountCents: 4900, status: "paid" },
      ] as never)
      .mockResolvedValueOnce([
        { amountCents: 4900, status: "paid" },
      ] as never);
    mockDb.org.findMany.mockResolvedValue([] as never);
    (mockDb.sessionEvent.groupBy as unknown as {
      mockResolvedValue: (v: unknown) => void;
    }).mockResolvedValue([{ orgId: "tenant-1", _count: { userId: 5 } }]);

    const res = await OVERVIEW_GET(
      makeRequest("http://localhost:3006/api/super/analytics/overview"),
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.tenantCount).toBe(12);
    expect(body.data.activeTenantCount).toBe(10);
    expect(body.data.userCount).toBe(50);
    expect(body.data.revenue.mrrCents).toBe(4900);
  });
});
