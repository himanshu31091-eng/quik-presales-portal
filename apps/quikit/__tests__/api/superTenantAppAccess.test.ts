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

import { GET, POST } from "@/app/api/super/org-app-access/[orgId]/route";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { orgId: "tenant-1" } };

// ─── GET /api/super/org-app-access/[orgId] ─────────────────────────────

describe("GET /api/super/org-app-access/[orgId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1"),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1"),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns app access list on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({
      id: "tenant-1",
      name: "Acme",
      slug: "acme",
    } as never);
    mockDb.app.findMany.mockResolvedValue([
      {
        id: "app-1",
        slug: "quikscale",
        name: "QuikScale",
        status: "active",
        iconUrl: null,
      },
    ] as never);
    mockDb.orgAppAccess.findMany.mockResolvedValue([] as never);

    const res = await GET(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1"),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.apps).toHaveLength(1);
    expect(body.data.apps[0].enabled).toBe(true); // default when no row
  });
});

// ─── POST /api/super/org-app-access/[orgId] ────────────────────────────

describe("POST /api/super/org-app-access/[orgId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1", {
        method: "POST",
        body: JSON.stringify({ appId: "app-1", enabled: false }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing appId/enabled)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("enables access and returns 200 (deletes sparse row)", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "tenant-1", name: "Acme" } as never);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app-1",
      slug: "quikscale",
      name: "QuikScale",
    } as never);
    mockDb.orgAppAccess.findUnique.mockResolvedValue(null as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1", {
        method: "POST",
        body: JSON.stringify({ appId: "app-1", enabled: true }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(true);
  });

  it("blocks access (enabled=false) and returns 200 via upsert", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "tenant-1", name: "Acme" } as never);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app-1",
      slug: "quikscale",
      name: "QuikScale",
    } as never);
    mockDb.orgAppAccess.findUnique.mockResolvedValue(null as never);
    const now = new Date();
    mockDb.orgAppAccess.upsert.mockResolvedValue({
      id: "taa-1",
      enabled: false,
      reason: "billing",
      updatedAt: now,
    } as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/org-app-access/tenant-1", {
        method: "POST",
        body: JSON.stringify({ appId: "app-1", enabled: false, reason: "billing" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(false);
    expect(body.data.reason).toBe("billing");
  });
});
