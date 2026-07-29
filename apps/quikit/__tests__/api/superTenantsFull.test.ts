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
  sendMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/super/orgs/[id]/full/route";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "t-1" } };

function primeHappyPathMocks() {
  // Preflight tenant lookup
  mockDb.org.findUnique.mockResolvedValue({
    id: "t-1",
    name: "Acme",
    slug: "acme",
    plan: "startup",
    status: "active",
    billingEmail: "billing@acme.com",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    _count: { users: 5, teams: 2, userAppAccess: 3 },
    users: [],
  } as never);

  mockDb.orgMember.count.mockResolvedValue(4 as never);
  mockDb.sessionEvent.findMany.mockResolvedValue([] as never);
  mockDb.sessionEvent.findFirst.mockResolvedValue(null as never);
  mockDb.kPI.count.mockResolvedValue(10 as never);
  mockDb.kPIWeeklyValue.count.mockResolvedValue(3 as never);
  mockDb.appModuleFlag.count.mockResolvedValue(1 as never);
  mockDb.orgAppAccess.count.mockResolvedValue(0 as never);
  mockDb.invoice.findFirst.mockResolvedValue({
    status: "paid",
    amountCents: 10000,
    currency: "USD",
    periodStart: new Date("2025-01-01T00:00:00Z"),
    paidAt: new Date("2025-01-05T00:00:00Z"),
    failedAt: null,
  } as never);
  mockDb.apiCall.count.mockResolvedValue(1234 as never);
  mockDb.sessionEvent.count.mockResolvedValue(50 as never);
  mockDb.app.findMany.mockResolvedValue([
    { id: "app-1", slug: "quikscale", name: "QuikScale", status: "active", iconUrl: null },
  ] as never);
  mockDb.orgAppAccess.findMany.mockResolvedValue([] as never);
  mockDb.invoice.findMany.mockResolvedValue([
    {
      id: "inv-1",
      amountCents: 10000,
      currency: "USD",
      status: "paid",
      periodStart: new Date("2025-01-01T00:00:00Z"),
      periodEnd: new Date("2025-01-31T00:00:00Z"),
      paidAt: new Date("2025-01-05T00:00:00Z"),
      failedAt: null,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-05T00:00:00Z"),
    },
  ] as never);
  mockDb.apiCallHourlyRollup.findMany.mockResolvedValue([] as never);
  mockDb.appModuleFlag.findMany.mockResolvedValue([] as never);
}

describe("GET /api/super/orgs/[id]/full", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/t-1/full"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/t-1/full"), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when tenant not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/t-1/full"), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Organization not found");
  });

  it("returns consolidated tenant data on happy path", async () => {
    setSession(SUPER_ADMIN);
    primeHappyPathMocks();

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/t-1/full"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);

    expect(body.success).toBe(true);
    expect(body.data.tenant).toMatchObject({
      id: "t-1",
      name: "Acme",
      slug: "acme",
      plan: "startup",
      status: "active",
    });
    // Health aggregate uses activeUserCount + kpisLoggedThisWeek + paid invoice + low disabledModuleCount
    // activeUserCount = 0 here (no distinct userIds), kpisLoggedThisWeek = 3, paid invoice, disabledModuleCount = 1
    // expected = 0 + 30 + 20 + 10 = 60
    expect(body.data.health.healthScore).toBe(60);
    expect(body.data.health.signals).toMatchObject({
      memberCount: 4,
      kpiCount: 10,
      kpisLoggedThisWeek: 3,
      disabledModuleCount: 1,
      blockedAppCount: 0,
      apiCallCount7d: 1234,
      sessionsLast30d: 50,
    });
    expect(body.data.appAccess.apps).toHaveLength(1);
    // Apps without access row default to enabled: true
    expect(body.data.appAccess.apps[0]).toMatchObject({
      slug: "quikscale",
      enabled: true,
    });
    expect(body.data.invoices.invoices).toHaveLength(1);
    expect(body.data.invoices.totals.paid).toBe(10000);
    expect(body.data.analytics.windowDays).toBe(30);
    expect(body.data.analytics.api.totalCalls).toBe(0);
  });

  it("computes health score 40 when only active users, no KPIs, no paid invoice, many disabled modules", async () => {
    setSession(SUPER_ADMIN);
    primeHappyPathMocks();
    // Active user count > 0
    mockDb.sessionEvent.findMany.mockResolvedValue([
      { userId: "u-1", createdAt: new Date() },
      { userId: "u-2", createdAt: new Date() },
    ] as never);
    // No KPIs logged this week
    mockDb.kPIWeeklyValue.count.mockResolvedValue(0 as never);
    // Invoice not paid
    mockDb.invoice.findFirst.mockResolvedValue({
      status: "pending",
      amountCents: 5000,
      currency: "USD",
      periodStart: new Date(),
      paidAt: null,
      failedAt: null,
    } as never);
    // Many disabled modules
    mockDb.appModuleFlag.count.mockResolvedValue(5 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/t-1/full"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    // 40 (active users) + 0 + 0 + 0 = 40
    expect(body.data.health.healthScore).toBe(40);
  });
});
