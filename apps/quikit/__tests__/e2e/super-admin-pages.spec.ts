import { test, expect } from "@playwright/test";

/**
 * Super-admin page smoke tests.
 *
 * Catches the "page crashes with 500" class of regressions for every key
 * super-admin page. Each test just navigates, waits for network idle,
 * and confirms the page renders without an unhandled error UI.
 *
 * When pages grow real assertions (e.g. "Analytics shows 3 KPI cards"),
 * promote them out of this smoke file.
 */

const SUPER_EMAIL = "e2e-super@test.com";
const SUPER_PASSWORD = "E2ETest123!";

test.beforeEach(async ({ page }) => {
  // Shared login step so each test starts authenticated.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(SUPER_EMAIL);
  await page.getByLabel(/password/i).fill(SUPER_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(apps|organizations|super)/, { timeout: 10_000 });
});

const SUPER_ADMIN_PAGES = [
  { path: "/organizations", label: "organizations" },
  { path: "/platform-users", label: "platform users" },
  { path: "/feature-flags", label: "feature flags" },
  { path: "/app-registry", label: "app registry" },
  { path: "/analytics", label: "analytics" },
  { path: "/broadcasts", label: "broadcasts" },
  { path: "/audit", label: "audit" },
  { path: "/pricing", label: "pricing" },
];

for (const { path, label } of SUPER_ADMIN_PAGES) {
  test(`${label} page loads without crashing`, async ({ page }) => {
    const response = await page.goto(path);
    // HTTP status should be OK — no 500 / 403
    expect(response?.status()).toBeLessThan(400);

    // Wait for hydration / first data fetch
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // Should NOT show "Application error" or Next.js error overlay text
    const errorText = page.getByText(/application error|unhandled runtime error|500: internal/i);
    await expect(errorText).not.toBeVisible();
  });
}
