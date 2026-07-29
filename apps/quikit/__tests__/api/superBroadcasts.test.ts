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

import { GET as LIST, POST as CREATE } from "@/app/api/super/broadcasts/route";
import { PATCH, DELETE } from "@/app/api/super/broadcasts/[id]/route";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "bc-1" } };

// ─── GET /api/super/broadcasts ───────────────────────────────────────────────

describe("GET /api/super/broadcasts", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await LIST(makeRequest("http://localhost:3006/api/super/broadcasts"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await LIST(makeRequest("http://localhost:3006/api/super/broadcasts"));
    expect(res.status).toBe(403);
  });

  it("returns broadcasts list on success", async () => {
    setSession(SUPER_ADMIN);
    const now = new Date();
    mockDb.broadcastAnnouncement.findMany.mockResolvedValue([
      {
        id: "bc-1",
        title: "Scheduled maintenance",
        body: "Downtime tonight",
        severity: "info",
        targetOrgIds: [],
        targetAppSlugs: [],
        startsAt: now,
        endsAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: "sa-1",
        _count: { dismissals: 0 },
      },
    ] as never);

    const res = await LIST(makeRequest("http://localhost:3006/api/super/broadcasts"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].dismissalCount).toBe(0);
  });
});

// ─── POST /api/super/broadcasts ──────────────────────────────────────────────

describe("POST /api/super/broadcasts", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: "Hi", body: "body" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: "Hi", body: "body" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when title/body missing", async () => {
    setSession(SUPER_ADMIN);
    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: "", body: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates broadcast and returns 201", async () => {
    setSession(SUPER_ADMIN);
    mockDb.broadcastAnnouncement.create.mockResolvedValue({
      id: "bc-new",
      title: "Hello",
      body: "World",
      severity: "info",
      targetOrgIds: [],
      targetAppSlugs: [],
      startsAt: new Date(),
      endsAt: null,
    } as never);

    const res = await CREATE(
      makeRequest("http://localhost:3006/api/super/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: "Hello", body: "World", severity: "info" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("bc-new");
  });
});

// ─── PATCH /api/super/broadcasts/[id] ────────────────────────────────────────

describe("PATCH /api/super/broadcasts/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when broadcast not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.broadcastAnnouncement.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("updates broadcast and returns 200", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "bc-1", title: "Old", body: "x", severity: "info" };
    mockDb.broadcastAnnouncement.findUnique.mockResolvedValue(existing as never);
    mockDb.broadcastAnnouncement.update.mockResolvedValue({
      ...existing,
      title: "New",
    } as never);

    const res = await PATCH(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("New");
  });
});

// ─── DELETE /api/super/broadcasts/[id] ───────────────────────────────────────

describe("DELETE /api/super/broadcasts/[id]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when broadcast not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.broadcastAnnouncement.findUnique.mockResolvedValue(null as never);
    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("deletes broadcast and returns 200", async () => {
    setSession(SUPER_ADMIN);
    const existing = { id: "bc-1", title: "Old" };
    mockDb.broadcastAnnouncement.findUnique.mockResolvedValue(existing as never);
    mockDb.broadcastAnnouncement.delete.mockResolvedValue(existing as never);

    const res = await DELETE(
      makeRequest("http://localhost:3006/api/super/broadcasts/bc-1", { method: "DELETE" }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
  });
});
