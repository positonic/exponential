import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / visual verification suite (dev-docs/AGENT_VISUAL_TESTING.md).
 *
 * `npx playwright test` is self-contained: the webServer block boots `next dev`
 * on :3100, and global-setup seeds the dev-fixture workspace and mints a
 * session cookie into e2e/.auth/ - no OAuth, no manual startup. Specs live in
 * e2e/*.spec.ts (vitest owns *.test.ts, so the suites never collide).
 *
 * Dev-only by construction: global-setup runs the same guards as the fixture
 * scripts (refuses NODE_ENV=production and non-local databases).
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup",
  outputDir: "./e2e/.results",
  // First hit on a `next dev` route pays compile + data-fetch cost; give each
  // test room for one cold route rather than tuning per-assertion timeouts.
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: "e2e/.auth/storageState.json",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --turbo -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
