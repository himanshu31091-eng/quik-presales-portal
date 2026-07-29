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

import { GET, POST } from "@/app/api/super/apps/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

// ─── GET /api/super/apps ─────────────────────────────────────────────────────

describe("GET /api/super/apps", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/apps"));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/apps"));
    expect(res.status).toBe(403);
  });

  it("returns app list on success", async () => {
    setSession(SUPER_ADMIN);

    const now = new Date();
    const mockApps = [
      {
        id: "app-1",
        name: "QuikScale",
        slug: "quikscale",
        description: "Scaling tool",
        baseUrl: "https://quikscale.example.com",
        status: "active",
        createdAt: now,
        oauthClient: { clientId: "client-1" },
      },
    ];

    mockDb.app.findMany.mockResolvedValue(mockApps as never);
    mockDb.app.count.mockResolvedValue(1 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/apps"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "app-1",
      name: "QuikScale",
      slug: "quikscale",
      hasOAuthClient: true,
    });
    expect(body.pagination).toBeDefined();
  });

  it("sets hasOAuthClient to false when no client", async () => {
    setSession(SUPER_ADMIN);

    const mockApps = [
      {
        id: "app-2",
        name: "NoOAuth",
        slug: "no-oauth",
        description: null,
        baseUrl: "https://no-oauth.example.com",
        status: "active",
        createdAt: new Date(),
        oauthClient: null,
      },
    ];

    mockDb.app.findMany.mockResolvedValue(mockApps as never);
    mockDb.app.count.mockResolvedValue(1 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/apps"));
    const body = await bodyOf(res);
    expect(body.data[0].hasOAuthClient).toBe(false);
  });
});

// ─── POST /api/super/apps ────────────────────────────────────────────────────

describe("POST /api/super/apps", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "App", slug: "app", baseUrl: "https://app.com" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "App", slug: "app", baseUrl: "https://app.com" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input (missing baseUrl)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "App", slug: "app" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid baseUrl", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "App", slug: "app", baseUrl: "not-a-url" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when slug already exists", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "existing" } as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "App", slug: "app", baseUrl: "https://app.com" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error).toContain("slug already exists");
  });

  it("creates app and returns 201 on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const createdApp = {
      id: "app-new",
      name: "NewApp",
      slug: "new-app",
      description: null,
      baseUrl: "https://new-app.com",
      status: "active",
      createdAt: new Date(),
    };
    mockDb.app.create.mockResolvedValue(createdApp as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/apps", {
        method: "POST",
        body: JSON.stringify({ name: "NewApp", slug: "new-app", baseUrl: "https://new-app.com" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("app-new");
  });
});
