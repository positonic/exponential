/**
 * Shared environment loading + safety guards for the dev-fixture tooling
 * (scripts/dev-session.ts, scripts/seed-dev-fixture.ts, e2e/global-setup.ts).
 *
 * These scripts exist so an agent (or a developer) can get an authenticated,
 * seeded local app without an OAuth round-trip. They must be impossible to
 * point at production by accident, so the guards mirror the hard-blocks in
 * src/test/test-db.ts (which exist because a test run once wiped production):
 * managed-service DB hosts are refused unconditionally, and NODE_ENV=production
 * refuses to run at all.
 */
import path from "path";
import { fileURLToPath } from "url";
// CJS default import - `@next/env` exposes no ESM named exports under tsx.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
// ESM-safe __dirname (tsx runs these as ESM; Playwright's loader as CJS may
// polyfill import.meta, so fall back either way).
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Same list as src/test/test-db.ts MANAGED_DB_HOST_PATTERNS. Kept as a copy on
// purpose: importing from src/test would couple dev tooling to the test
// harness's module graph (integration-setup mocks, vitest globals).
const MANAGED_DB_HOST_PATTERNS: RegExp[] = [
  /\.rlwy\.net/i,
  /\.railway\.app/i,
  /\.supabase\./i,
  /\.neon\.tech/i,
  /\.amazonaws\.com/i,
  /\.azure\.com/i,
  /\.gcp\.cloud/i,
  /\.fly\.dev/i,
  /digitalocean/i,
  /\.aiven\.io/i,
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}

/**
 * Load .env.local + .env exactly the way `next dev` does (AUTH_SECRET lives in
 * .env.local, which Prisma's own loader does NOT read), then verify this
 * environment is a safe target. Throws with a clear message otherwise.
 */
export function loadDevEnvOrThrow(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[dev-fixture] Refusing to run with NODE_ENV=production. " +
        "This tooling mints sessions and writes fixture rows - dev only.",
    );
  }

  loadEnvConfig(path.resolve(scriptDir, "../.."), true, { info: () => undefined, error: console.error });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("[dev-fixture] DATABASE_URL is not set after loading .env/.env.local");
  }

  for (const pattern of MANAGED_DB_HOST_PATTERNS) {
    if (pattern.test(dbUrl)) {
      throw new Error(
        `[dev-fixture] Refusing managed-service DB host (matched ${pattern}): ${redact(dbUrl)}\n` +
          "This tooling writes fixture rows and mints sessions - local databases only.",
      );
    }
  }

  let host: string;
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    throw new Error(`[dev-fixture] DATABASE_URL is not a parseable URL: ${redact(dbUrl)}`);
  }
  if (!LOCAL_HOSTS.has(host) && !/[-_.]test/i.test(dbUrl)) {
    throw new Error(
      `[dev-fixture] DATABASE_URL host "${host}" is not local and does not look like a test DB: ${redact(dbUrl)}\n` +
        "Point DATABASE_URL at a localhost Postgres to use the dev-fixture tooling.",
    );
  }

  if (!process.env.AUTH_SECRET) {
    throw new Error(
      "[dev-fixture] AUTH_SECRET is not set after loading .env/.env.local - " +
        "it is required to mint a session cookie the app will accept.",
    );
  }
}
