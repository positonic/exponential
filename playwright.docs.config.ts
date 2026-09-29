import { defineConfig, devices } from "@playwright/test";

/**
 * `npm run docs:screenshots` — regenerate public/doc-assets from the
 * dev-fixture workspace, in dark and light, at 1280×800.
 *
 * Separate from playwright.config.ts so the capture never runs as part of
 * `test:e2e`. Reuses its global setup (seed + minted session) and dev server.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e/docs-screenshots",
  globalSetup: "./e2e/global-setup",
  outputDir: "./e2e/.results/docs-screenshots",
  timeout: 180_000,
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
