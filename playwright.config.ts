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
// Override with E2E_PORT when another checkout already holds 3100 (parallel
// worktrees): with reuseExistingServer the suite would otherwise run against
// that checkout's server instead of this one.
const PORT = Number(process.env.E2E_PORT ?? 3100);

// Shared with e2e/fixture-data.ts (kept literal there — specs do not import the config).
const E2E_MASTRA_STUB_URL = "http://127.0.0.1:4199";
const E2E_CRON_SECRET = "e2e-cron-secret";

export default defineConfig({
  testDir: "./e2e",
  // e2e/perf/ has its own config (production build, one worker).
  testIgnore: ["perf/**", "docs-screenshots/**"],
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
    // Never deliver real email from a spec: booking a meeting sends calendar
    // invites, and `.env.local` carries a live Postmark key. The switch blocks
    // every send whatever the key source (env or a workspace integration).
    // It only reaches a server Playwright starts — a reused one must be
    // started with EMAIL_DELIVERY_DISABLED=1 (AGENT_VISUAL_TESTING.md).
    env: {
      EMAIL_DELIVERY_DISABLED: "1",
      // Agent runs (ADR-0067) never reach a real Mastra from a spec: the
      // assign-to-assistant spec runs a stub on this port, and any other
      // spec that trips a run just fails the dispatch quietly. The cron
      // secret is fixed so a spec can kick the dispatcher deterministically.
      MASTRA_API_URL: E2E_MASTRA_STUB_URL,
      CRON_SECRET: E2E_CRON_SECRET,
    },
  },
});
