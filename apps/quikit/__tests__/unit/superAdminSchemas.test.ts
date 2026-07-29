import { describe, it, expect } from "vitest";
import {
  createOrgSchema,
  updateOrgSchema,
  createAppSchema,
  updateAppSchema,
  createUserSchema,
  updateUserSchema,
} from "@/lib/schemas/superAdminSchemas";

// ─── createOrgSchema ─────────────────────────────────────────────────────────

describe("createOrgSchema", () => {
  const valid = {
    name: "Acme Corp",
    slug: "acme-corp",
    plan: "startup" as const,
  };

  it("accepts a valid org with minimal fields", () => {
    const result = createOrgSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a valid org with all optional fields", () => {
    const result = createOrgSchema.safeParse({
      ...valid,
      billingEmail: "billing@acme.com",
      description: "A test org",
    });
    expect(result.success).toBe(true);
  });

  it("defaults plan to startup", () => {
    const result = createOrgSchema.safeParse({ name: "X", slug: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe("startup");
    }
  });

  it("rejects empty name", () => {
    const result = createOrgSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createOrgSchema.safeParse({ ...valid, name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = createOrgSchema.safeParse({ ...valid, slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    const result = createOrgSchema.safeParse({ ...valid, slug: "Acme-Corp" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = createOrgSchema.safeParse({ ...valid, slug: "acme corp" });
    expect(result.success).toBe(false);
  });

  it("rejects slug over 50 chars", () => {
    const result = createOrgSchema.safeParse({ ...valid, slug: "a".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan", () => {
    const result = createOrgSchema.safeParse({ ...valid, plan: "free" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid billingEmail", () => {
    const result = createOrgSchema.safeParse({ ...valid, billingEmail: "not-email" });
    expect(result.success).toBe(false);
  });

  it("allows null billingEmail", () => {
    const result = createOrgSchema.safeParse({ ...valid, billingEmail: null });
    expect(result.success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    const result = createOrgSchema.safeParse({ ...valid, description: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ─── updateOrgSchema ─────────────────────────────────────────────────────────

describe("updateOrgSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateOrgSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with name only", () => {
    const result = updateOrgSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts status field", () => {
    const result = updateOrgSchema.safeParse({ status: "suspended" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateOrgSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = updateOrgSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

// ─── createAppSchema ─────────────────────────────────────────────────────────

describe("createAppSchema", () => {
  const valid = {
    name: "QuikScale",
    slug: "quikscale",
    baseUrl: "https://quikscale.example.com",
  };

  it("accepts a valid app", () => {
    const result = createAppSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults status to active", () => {
    const result = createAppSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });

  it("rejects missing baseUrl", () => {
    const { baseUrl, ...noUrl } = valid;
    const result = createAppSchema.safeParse(noUrl);
    expect(result.success).toBe(false);
  });

  it("rejects invalid baseUrl", () => {
    const result = createAppSchema.safeParse({ ...valid, baseUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = createAppSchema.safeParse({ ...valid, slug: "quik_scale!" });
    expect(result.success).toBe(false);
  });

  it("accepts coming_soon status", () => {
    const result = createAppSchema.safeParse({ ...valid, status: "coming_soon" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = createAppSchema.safeParse({ ...valid, status: "beta" });
    expect(result.success).toBe(false);
  });
});

// ─── updateAppSchema ─────────────────────────────────────────────────────────

describe("updateAppSchema", () => {
  it("accepts empty object", () => {
    const result = updateAppSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = updateAppSchema.safeParse({ name: "New App Name" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid baseUrl", () => {
    const result = updateAppSchema.safeParse({ baseUrl: "bad" });
    expect(result.success).toBe(false);
  });
});

// ─── createUserSchema ────────────────────────────────────────────────────────

describe("createUserSchema", () => {
  const valid = {
    email: "user@test.com",
    firstName: "John",
    lastName: "Doe",
    password: "securepass123",
  };

  it("accepts a valid user", () => {
    const result = createUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults isSuperAdmin to false", () => {
    const result = createUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isSuperAdmin).toBe(false);
    }
  });

  it("rejects invalid email", () => {
    const result = createUserSchema.safeParse({ ...valid, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = createUserSchema.safeParse({ ...valid, firstName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty lastName", () => {
    const result = createUserSchema.safeParse({ ...valid, lastName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = createUserSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts password of exactly 8 chars", () => {
    const result = createUserSchema.safeParse({ ...valid, password: "12345678" });
    expect(result.success).toBe(true);
  });

  it("allows isSuperAdmin=true", () => {
    const result = createUserSchema.safeParse({ ...valid, isSuperAdmin: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isSuperAdmin).toBe(true);
    }
  });
});

// ─── updateUserSchema ────────────────────────────────────────────────────────

describe("updateUserSchema", () => {
  it("accepts empty object", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial firstName update", () => {
    const result = updateUserSchema.safeParse({ firstName: "Jane" });
    expect(result.success).toBe(true);
  });

  it("accepts isSuperAdmin toggle", () => {
    const result = updateUserSchema.safeParse({ isSuperAdmin: true });
    expect(result.success).toBe(true);
  });

  it("rejects empty firstName", () => {
    const result = updateUserSchema.safeParse({ firstName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects firstName over 100 chars", () => {
    const result = updateUserSchema.safeParse({ firstName: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});
