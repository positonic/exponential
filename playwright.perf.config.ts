import { defineConfig, devices } from "@playwright/test";

/**
 * Page-load perf harness (e2e/perf/). Separate from playwright.config.ts
 * because it must run against a PRODUCTION build, one test at a time:
 * parallel workers on one machine would contend for CPU and the database and
 * corrupt every timing.
 *
 *   npx next build && npm run test:perf
 *   npx tsx e2e/perf/report.ts e2e/.results/perf/<run-id>
 *
 * Needs `.next/` from `next build` in this checkout. PERF_PORT overrides the
 * port; an already-running `next start` on it is reused (start it with
 * AUTH_TRUST_HOST=true or every page redirects to /signin).
 */
const PORT = Number(process.env.PERF_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e/perf",
  testMatch: "*.perf.ts",
  globalSetup: "./e2e/perf/global-setup",
  outputDir: "./e2e/.results/perf-artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Auth.js rejects untrusted hosts in production mode; Vercel sets this
    // implicitly, a local `next start` needs it spelled out.
    command: `AUTH_TRUST_HOST=true npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
