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

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
  hash: vi.fn().mockResolvedValue("hashed-password"),
}));

import { GET, POST } from "@/app/api/super/users/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

// ─── GET /api/super/users ────────────────────────────────────────────────────

describe("GET /api/super/users", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/users"));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/users"));
    expect(res.status).toBe(403);
  });

  it("returns user list with pagination", async () => {
    setSession(SUPER_ADMIN);

    const mockUsers = [
      {
        id: "u-1",
        email: "john@test.com",
        firstName: "John",
        lastName: "Doe",
        isSuperAdmin: false,
        lastSignInAt: new Date("2024-01-01"),
        _count: { memberships: 2 },
      },
    ];

    mockDb.user.findMany.mockResolvedValue(mockUsers as never);
    mockDb.user.count.mockResolvedValue(1 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/users"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "u-1",
      email: "john@test.com",
      membershipCount: 2,
    });
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });

  it("passes search parameter to query", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findMany.mockResolvedValue([] as never);
    mockDb.user.count.mockResolvedValue(0 as never);

    await GET(makeRequest("http://localhost:3006/api/super/users?search=john"));

    expect(mockDb.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ email: expect.objectContaining({ contains: "john" }) }),
          ]),
        }),
      }),
    );
  });
});

// ─── POST /api/super/users ───────────────────────────────────────────────────

describe("POST /api/super/users", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          email: "new@test.com",
          firstName: "New",
          lastName: "User",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          email: "new@test.com",
          firstName: "New",
          lastName: "User",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input (missing email)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          firstName: "New",
          lastName: "User",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 400 for short password", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          email: "new@test.com",
          firstName: "New",
          lastName: "User",
          password: "short",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when email already exists", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue({ id: "existing" } as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          email: "existing@test.com",
          firstName: "New",
          lastName: "User",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error).toContain("email already exists");
  });

  it("creates user and returns 201 on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue(null as never);

    const createdUser = {
      id: "u-new",
      email: "new@test.com",
      firstName: "New",
      lastName: "User",
      isSuperAdmin: false,
      createdAt: new Date(),
    };
    mockDb.user.create.mockResolvedValue(createdUser as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/users", {
        method: "POST",
        body: JSON.stringify({
          email: "new@test.com",
          firstName: "New",
          lastName: "User",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("u-new");
    expect(body.data.email).toBe("new@test.com");
  });
});
