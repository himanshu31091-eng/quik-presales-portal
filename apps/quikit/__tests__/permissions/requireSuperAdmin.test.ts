import { describe, it, expect, beforeEach } from "vitest";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

// Helper to extract JSON body from NextResponse
async function bodyOf(res: Response) {
  return res.json();
}

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    resetMockDb();
  });

  // ── 401: no session ──────────────────────────────────────────────────────
  it("returns 401 when there is no session", async () => {
    setSession(null);

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
      const body = await bodyOf(result.error);
      expect(body).toEqual({ success: false, error: "Unauthorized" });
    }
  });

  // ── 401: session with no id ──────────────────────────────────────────────
  it("returns 401 when session user has no id", async () => {
    // Simulate a malformed session where user.id is missing
    setSession({ id: "" });

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
    }
  });

  // ── 403: user is not super admin (JWT flag false) ────────────────────────
  it("returns 403 when user is not a super admin (isSuperAdmin=false)", async () => {
    setSession({ id: "user-1", email: "regular@test.com", isSuperAdmin: false });

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
      const body = await bodyOf(result.error);
      expect(body).toEqual({
        success: false,
        error: "Super admin access required",
      });
    }
  });

  // ── Success: JWT flag is true (fast path) ────────────────────────────────
  it("returns userId when user has isSuperAdmin=true in JWT", async () => {
    setSession({ id: "sa-1", email: "admin@test.com", isSuperAdmin: true });

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("sa-1");
    }
    // Should NOT hit the database — the JWT flag is trusted
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  // ── Fallback: JWT flag undefined, DB says super admin ────────────────────
  it("falls back to DB check when isSuperAdmin is undefined in JWT, and DB confirms", async () => {
    setSession({ id: "sa-2", email: "admin@test.com" }); // no isSuperAdmin

    mockDb.user.findUnique.mockResolvedValue({
      isSuperAdmin: true,
    } as never);

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("sa-2");
    }
    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { id: "sa-2" },
      select: { isSuperAdmin: true },
    });
  });

  // ── Fallback: JWT flag undefined, DB says NOT super admin ────────────────
  it("returns 403 when isSuperAdmin is undefined in JWT and DB says false", async () => {
    setSession({ id: "user-3", email: "regular@test.com" }); // no isSuperAdmin

    mockDb.user.findUnique.mockResolvedValue({
      isSuperAdmin: false,
    } as never);

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });

  // ── Fallback: JWT flag undefined, user not found in DB ───────────────────
  it("returns 403 when isSuperAdmin is undefined and user not found in DB", async () => {
    setSession({ id: "ghost-user", email: "ghost@test.com" }); // no isSuperAdmin

    mockDb.user.findUnique.mockResolvedValue(null);

    const result = await requireSuperAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });
});
