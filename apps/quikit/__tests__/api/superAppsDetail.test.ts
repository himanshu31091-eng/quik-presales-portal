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

import { GET, PATCH, DELETE } from "@/app/api/super/apps/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "app-1" } };

// ─── GET /api/super/apps/[id] ────────────────────────────────────────────────

describe("GET /api/super/apps/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when app not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("App not found");
  });

  it("returns app detail on success", async () => {
    setSession(SUPER_ADMIN);
    const mockApp = {
      id: "app-1",
      name: "QuikScale",
      slug: "quikscale",
      baseUrl: "https://quikscale.example.com",
      status: "active",
      oauthClient: {
        id: "oc-1",
        clientId: "client-1",
        redirectUris: ["https://quikscale.example.com/callback"],
        scopes: ["openid", "profile"],
        grantTypes: ["authorization_code"],
        createdAt: new Date(),
      },
      _count: { userAccess: 10 },
    };
    mockDb.app.findUnique.mockResolvedValue(mockApp as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("app-1");
    expect(body.data.oauthClient).toBeDefined();
  });
});

// ─── PATCH /api/super/apps/[id] ──────────────────────────────────────────────

describe("PATCH /api/super/apps/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/apps/app-1", {
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
      makeRequest("http://localhost:3006/api/super/apps/app-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input (bad baseUrl)", async () => {
    setSession(SUPER_ADMIN);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/apps/app-1", {
        method: "PATCH",
        body: JSON.stringify({ baseUrl: "not-a-url" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when app not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/apps/app-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("updates app and returns 200 on success", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "app-1", name: "QuikScale", status: "active" };
    mockDb.app.findUnique.mockResolvedValue(existing as never);

    const updated = { ...existing, name: "QuikScale Pro" };
    mockDb.app.update.mockResolvedValue(updated as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/apps/app-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "QuikScale Pro" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("QuikScale Pro");
  });
});

// ─── DELETE /api/super/apps/[id] ─────────────────────────────────────────────

describe("DELETE /api/super/apps/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await DELETE(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DELETE(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when app not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await DELETE(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(404);
  });

  it("disables app and returns 200 on success", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "app-1", name: "QuikScale", status: "active" };
    mockDb.app.findUnique.mockResolvedValue(existing as never);
    mockDb.app.update.mockResolvedValue({ ...existing, status: "disabled" } as never);

    const res = await DELETE(makeRequest("http://localhost:3006/api/super/apps/app-1"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.message).toBe("App disabled");
  });
});
