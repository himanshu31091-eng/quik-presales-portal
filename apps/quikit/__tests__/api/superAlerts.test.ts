/**
 * Tests — GET /api/super/alerts  +  POST /api/super/alerts/:id/acknowledge
 *
 * Covers the auth matrix (unauthenticated, regular user, super admin) and
 * the happy path for both routes. Matches the mocking pattern used in the
 * other apps/quikit/__tests__/api files.
 */
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

import { GET as listAlerts } from "@/app/api/super/alerts/route";
import { POST as ackAlert } from "@/app/api/super/alerts/[id]/acknowledge/route";

function makeRequest(url: string, method: "GET" | "POST" = "GET") {
  return new NextRequest(new URL(url, "http://localhost:3006"), { method });
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

describe("GET /api/super/alerts", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await listAlerts(makeRequest("http://localhost:3006/api/super/alerts"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await listAlerts(makeRequest("http://localhost:3006/api/super/alerts"));
    expect(res.status).toBe(403);
  });

  it("returns open alerts for super admin", async () => {
    setSession(SUPER_ADMIN);

    const now = new Date();
    const mockAlerts = [
      {
        id: "a-1",
        rule: "app_down",
        severity: "critical",
        title: "Quikscale is down",
        message: "healthcheck has failed",
        link: null,
        firstSeenAt: now,
        lastSeenAt: now,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
      },
      {
        id: "a-2",
        rule: "api_error_spike",
        severity: "warning",
        title: "Errors elevated",
        message: "",
        link: null,
        firstSeenAt: now,
        lastSeenAt: now,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
      },
    ];

    mockDb.platformAlert.findMany.mockResolvedValue(mockAlerts as never);

    const res = await listAlerts(makeRequest("http://localhost:3006/api/super/alerts"));
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("a-1");
    expect(body.data[0].firstSeenAt).toBe(now.toISOString());
    expect(body.data[0].lastSeenAt).toBe(now.toISOString());
    expect(body.data[0].acknowledgedAt).toBeNull();
  });

  it("passes the right filter (resolvedAt: null) to findMany", async () => {
    setSession(SUPER_ADMIN);
    mockDb.platformAlert.findMany.mockResolvedValue([] as never);

    await listAlerts(makeRequest("http://localhost:3006/api/super/alerts"));

    const call = mockDb.platformAlert.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ resolvedAt: null });
    // Takes 50 to bound payload size
    expect(call?.take).toBe(50);
  });

  it("wraps DB errors with a 500 + error string", async () => {
    setSession(SUPER_ADMIN);
    mockDb.platformAlert.findMany.mockRejectedValue(new Error("db went kaboom") as never);

    const res = await listAlerts(makeRequest("http://localhost:3006/api/super/alerts"));
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain("db went kaboom");
  });
});

describe("POST /api/super/alerts/:id/acknowledge", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await ackAlert(
      makeRequest("http://localhost:3006/api/super/alerts/a-1/acknowledge", "POST"),
      { params: { id: "a-1" } },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await ackAlert(
      makeRequest("http://localhost:3006/api/super/alerts/a-1/acknowledge", "POST"),
      { params: { id: "a-1" } },
    );
    expect(res.status).toBe(403);
  });

  it("acknowledges alert and stamps acknowledgedBy = current super admin", async () => {
    setSession(SUPER_ADMIN);

    const now = new Date();
    mockDb.platformAlert.update.mockResolvedValue({
      id: "a-1",
      acknowledgedAt: now,
      acknowledgedBy: SUPER_ADMIN.id,
    } as never);

    const res = await ackAlert(
      makeRequest("http://localhost:3006/api/super/alerts/a-1/acknowledge", "POST"),
      { params: { id: "a-1" } },
    );
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("a-1");

    const call = mockDb.platformAlert.update.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: "a-1" });
    expect(call?.data.acknowledgedBy).toBe(SUPER_ADMIN.id);
    expect(call?.data.acknowledgedAt).toBeInstanceOf(Date);
  });

  it("wraps failures with 500 + error string", async () => {
    setSession(SUPER_ADMIN);
    mockDb.platformAlert.update.mockRejectedValue(new Error("no such alert") as never);

    const res = await ackAlert(
      makeRequest("http://localhost:3006/api/super/alerts/a-1/acknowledge", "POST"),
      { params: { id: "a-1" } },
    );
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain("no such alert");
  });
});
