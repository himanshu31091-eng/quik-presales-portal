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

import { GET, PATCH, DELETE } from "@/app/api/super/orgs/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "org-1" } };

// ─── GET /api/super/orgs/[id] ────────────────────────────────────────────────

describe("GET /api/super/orgs/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when org not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Organization not found");
  });

  it("returns org detail on success", async () => {
    setSession(SUPER_ADMIN);
    const mockTenant = {
      id: "org-1",
      name: "Acme",
      slug: "acme",
      plan: "startup",
      status: "active",
      _count: { users: 3, teams: 1, userAppAccess: 2 },
      users: [],
    };
    mockDb.org.findUnique.mockResolvedValue(mockTenant as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("org-1");
  });
});

// ─── PATCH /api/super/orgs/[id] ──────────────────────────────────────────────

describe("PATCH /api/super/orgs/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/orgs/org-1", {
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
      makeRequest("http://localhost:3006/api/super/orgs/org-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input", async () => {
    setSession(SUPER_ADMIN);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/orgs/org-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 404 when org not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/orgs/org-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("updates org and returns 200 on success", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "org-1", name: "Acme", plan: "startup", status: "active" };
    mockDb.org.findUnique.mockResolvedValue(existing as never);

    const updated = { ...existing, name: "Acme Updated" };
    mockDb.org.update.mockResolvedValue(updated as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/orgs/org-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Acme Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Acme Updated");
  });
});

// ─── DELETE /api/super/orgs/[id] ─────────────────────────────────────────────

describe("DELETE /api/super/orgs/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await DELETE(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DELETE(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when org not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await DELETE(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(404);
  });

  it("suspends org and returns 200 on success", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "org-1", name: "Acme", status: "active" };
    mockDb.org.findUnique.mockResolvedValue(existing as never);
    mockDb.org.update.mockResolvedValue({ ...existing, status: "suspended" } as never);

    // The route does a fire-and-forget membership lookup for email notifications
    const membershipPromise = Promise.resolve([]);
    mockDb.orgMember.findMany.mockReturnValue(membershipPromise as never);

    const res = await DELETE(makeRequest("http://localhost:3006/api/super/orgs/org-1"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Organization suspended");
  });
});
