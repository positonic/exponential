/**
 * Reads the seeded-fixture manifest written by global-setup, giving specs the
 * URLs/ids of the seeded data without hardcoding CUIDs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SeededFixture } from "../scripts/dev-fixture/seed";

export function loadFixture(): SeededFixture {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "fixture.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as SeededFixture;
}

/** Where the Playwright-started dev server expects Mastra (see playwright.config.ts webServer.env). */
export const E2E_MASTRA_STUB_PORT = 4199;
/** The dev server's CRON_SECRET under Playwright (see playwright.config.ts webServer.env). */
export const E2E_CRON_SECRET = "e2e-cron-secret";
