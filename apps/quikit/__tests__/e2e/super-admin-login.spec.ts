import { test, expect } from "@playwright/test";

/**
 * Super-admin login + routing smoke.
 *
 * Verifies:
 *   - Super admin can log in
 *   - After login, routes under /apps (launcher) are accessible
 *   - Super-admin surface is reachable at /organizations (or equivalent)
 */

const SUPER_EMAIL = "e2e-super@test.com";
const SUPER_PASSWORD = "E2ETest123!";

test("super admin can log in and reach launcher", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill(SUPER_EMAIL);
  await page.getByLabel(/password/i).fill(SUPER_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();

  // Should land on /apps (launcher) or a super-admin home
  await expect(page).toHaveURL(/\/(apps|organizations|super)/, { timeout: 10_000 });
});

test("super admin can access /organizations (tenant list)", async ({ page }) => {
  // Login first
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(SUPER_EMAIL);
  await page.getByLabel(/password/i).fill(SUPER_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(apps|organizations|super)/, { timeout: 10_000 });

  // Navigate to organizations page
  await page.goto("/organizations");
  // Should NOT be redirected to /login
  await expect(page).not.toHaveURL(/\/login/);
  // Should render SOMETHING related to tenants (heading or empty state)
  await expect(
    page.getByRole("heading").or(page.getByText(/tenant|organization/i)).first(),
  ).toBeVisible({ timeout: 5_000 });
});

test("non-super-admin users cannot reach /organizations", async ({ page }) => {
  // Login as regular admin (from quikscale seed)
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.com");
  await page.getByLabel(/password/i).fill(SUPER_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  // They may land anywhere, just wait for either apps or a redirect
  await page.waitForLoadState("networkidle");

  // Try to hit super-admin surface
  await page.goto("/organizations");

  // Regular admin should be blocked — either redirect to login, back to /apps,
  // or see a 403/forbidden page. In any case, NOT the tenant list.
  const url = page.url();
  const blocked =
    url.includes("/login") ||
    url.endsWith("/apps") ||
    url.includes("/forbidden") ||
    url.includes("/403");
  expect(blocked).toBe(true);
});
