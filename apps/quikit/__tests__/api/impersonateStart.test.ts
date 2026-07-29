import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

// Rate limiter is fail-closed in prod; in tests, always allow so the other
// assertions aren't masked by 429s.
vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: vi.fn().mockResolvedValue({
    ok: true,
    remaining: 9,
    resetAt: Date.now() + 3600_000,
    retryAfterSeconds: 0,
    redisAvailable: false,
  }),
}));

import { POST } from "@/app/api/super/impersonate/start/route";

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };

function makeRequest(body: unknown) {
  return new NextRequest(new URL("/api/super/impersonate/start", "http://localhost:3006"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  } as never);
}

describe("POST /api/super/impersonate/start", () => {
  beforeEach(() => {
    resetMockDb();
    setSession(SUPER_ADMIN);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 401 when caller is not a super admin", async () => {
    setSession({ id: "u-1", email: "u@test.com", isSuperAdmin: false });
    const res = await POST(makeRequest({ targetUserId: "u", targetOrgId: "t", targetAppSlug: "quikscale" }));
    expect([401, 403]).toContain(res.status);
  });

  it("returns 404 when target user has no active membership", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({
      targetUserId: "target-user",
      targetOrgId: "tenant-1",
      targetAppSlug: "quikscale",
    }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when trying to impersonate another super admin", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "admin",
      user: { id: "su-2", email: "su2@test.com", firstName: "Other", lastName: "SA" },
      org: { id: "tenant-1", name: "Test" },
    } as never);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app-1", baseUrl: "http://localhost:3002", name: "QuikScale", status: "active",
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: true, email: "su2@test.com" } as never);
    const res = await POST(makeRequest({
      targetUserId: "su-2",
      targetOrgId: "tenant-1",
      targetAppSlug: "quikscale",
    }));
    expect(res.status).toBe(403);
  });

  it("creates an Impersonation row and returns a redirect URL on happy path", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "admin",
      user: { id: "target-1", email: "target@test.com", firstName: "Target", lastName: "User" },
      org: { id: "tenant-1", name: "Acme Corp" },
    } as never);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app-1", baseUrl: "http://localhost:3002", name: "QuikScale", status: "active",
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false, email: "target@test.com" } as never);
    mockDb.impersonation.create.mockResolvedValue({ id: "imp-1" } as never);

    const res = await POST(makeRequest({
      targetUserId: "target-1",
      targetOrgId: "tenant-1",
      targetAppSlug: "quikscale",
      reason: "Debugging support ticket #123",
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.redirectUrl).toMatch(/^http:\/\/localhost:3002\/api\/auth\/impersonate\//);
    expect(body.data.target.userEmail).toBe("target@test.com");
    expect(body.data.target.appName).toBe("QuikScale");

    // Verify the impersonation row was created with expected shape
    const createCall = mockDb.impersonation.create.mock.calls[0]?.[0];
    expect(createCall?.data).toMatchObject({
      superAdminId: SUPER_ADMIN.id,
      targetUserId: "target-1",
      targetOrgId: "tenant-1",
      targetAppSlug: "quikscale",
      reason: "Debugging support ticket #123",
    });
    expect(typeof (createCall?.data as { token?: unknown }).token).toBe("string");
    expect((createCall?.data as { token: string }).token.length).toBeGreaterThanOrEqual(40);
  });

  it("rejects apps with a relative (launcher-self) baseUrl", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "admin",
      user: { id: "target-1", email: "t@test.com", firstName: "T", lastName: "U" },
      org: { id: "tenant-1", name: "Acme" },
    } as never);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app-1", baseUrl: "/", name: "QuikIT", status: "active",
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false, email: "t@test.com" } as never);

    const res = await POST(makeRequest({
      targetUserId: "target-1",
      targetOrgId: "tenant-1",
      targetAppSlug: "quikit",
    }));
    expect(res.status).toBe(400);
  });
});
