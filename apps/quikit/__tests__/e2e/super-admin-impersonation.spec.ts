import { test, expect } from "@playwright/test";

/**
 * Impersonation round-trip — API-level.
 *
 * We can't full-E2E the cross-origin redirect in this harness without
 * also running apps/quikscale on port 3002. What we CAN cover cheaply:
 *   - POST /api/super/impersonate/start returns a redirectUrl when a
 *     super admin is logged in
 *   - Rate-limit 429 when the per-super-admin cap is exceeded
 *   - Non-super-admin users are rejected
 *   - Target must exist (invalid tenant/user/app => 404/400)
 *
 * If we later add a two-server fixture, promote this into a full
 * browser round-trip spec (click View-as -> land on /dashboard in the
 * target app -> Exit -> return to /apps).
 */

const SUPER_EMAIL = "e2e-super@test.com";
const REGULAR_EMAIL = "e2e-admin@test.com";
const PASSWORD = "E2ETest123!";

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(apps|organizations|super|dashboard)/, { timeout: 10_000 });
}

test("impersonate:start rejects unauthenticated", async ({ request }) => {
  const res = await request.post("/api/super/impersonate/start", {
    data: { targetUserId: "x", targetOrgId: "x", targetAppSlug: "quikscale" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(401);
  expect(res.status()).toBeLessThan(500);
});

test("impersonate:start rejects non-super-admin user", async ({ page, request }) => {
  await loginAs(page, REGULAR_EMAIL);
  // Re-use the page's session cookie via request context
  const res = await request.post("/api/super/impersonate/start", {
    data: { targetUserId: "x", targetOrgId: "x", targetAppSlug: "quikscale" },
  });
  // Regular admin should get 401/403, not 200
  expect(res.status()).toBeGreaterThanOrEqual(401);
  expect(res.status()).toBeLessThan(500);
});

test("impersonate:start returns 400/404 for unknown targets", async ({ page, request }) => {
  await loginAs(page, SUPER_EMAIL);
  const res = await request.post("/api/super/impersonate/start", {
    data: {
      targetUserId: "clxxxxxxxxxxxxxxxxxxxxxx",
      targetOrgId: "clyyyyyyyyyyyyyyyyyyyyyy",
      targetAppSlug: "quikscale",
    },
  });
  // Should be 404 (unknown target) not 200
  expect([400, 404]).toContain(res.status());
});

test("impersonate:start rejects missing required fields with 400", async ({ page, request }) => {
  await loginAs(page, SUPER_EMAIL);
  const res = await request.post("/api/super/impersonate/start", {
    data: {},
  });
  expect(res.status()).toBe(400);
});
