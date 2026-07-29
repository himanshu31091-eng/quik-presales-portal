import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for QuikIT (launcher + super-admin).
 *
 * Mirrors apps/quikscale/playwright.config.ts:
 * - webServer uses `build && start`, NOT `dev`, to avoid HMR flake.
 * - Specs live under `__tests__/e2e/`.
 * - Runs on chromium only by default.
 *
 * Prerequisites:
 *   - One-time: `npx playwright install --with-deps chromium` (run inside
 *     apps/quikit OR use the shared `npm run e2e:install` if extended to
 *     this app).
 *   - Every run: `npm run db:seed:e2e` to create the super-admin test user.
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
