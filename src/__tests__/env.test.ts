// @vitest-environment node
/**
 * The production env schema: an install boots with exactly three variables
 * (DATABASE_URL, AUTH_SECRET, DATABASE_ENCRYPTION_KEY), and a missing or
 * malformed one fails at boot with a readable message instead of 500ing every
 * request later. LLM keys are optional (smoky.anvil): with none, AI switches off.
 *
 * t3-env validates when `src/env.js` is imported and caches the result, so each
 * case stubs the environment, resets the module registry and imports afresh.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const THREE_VARS = {
  DATABASE_URL: "postgresql://exponential:exponential@localhost:5432/exponential",
  AUTH_SECRET: "a-long-random-secret",
  DATABASE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

/** Everything the schema reads that a developer's shell might also carry. */
const OTHER_VARS = [
  "AUTH_DISCORD_ID",
  "AUTH_DISCORD_SECRET",
  "DATABASE_ENCRYPTION_KEY_PREVIOUS",
  "UPSTASH_REDIS_REST_URL",
  "VERCEL_ENV",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
  "AUTH_LOG_SIGN_IN_CODES",
  "CRON_SECRET",
  "OPENAI_API_KEY",
];

function stubProductionEnv(vars: Record<string, string | undefined>) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SKIP_ENV_VALIDATION", "");
  for (const name of OTHER_VARS) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value ?? "");
}

async function importEnv() {
  // The unit setup registers happy-dom globally, so t3-env would think it runs
  // in a browser and refuse server-side reads. Hide `window` for the import.
  vi.stubGlobal("window", undefined);
  vi.resetModules();
  return import("~/env");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production env schema", () => {
  it("resolves with only the three required variables, no LLM key", async () => {
    stubProductionEnv(THREE_VARS);
    const { env } = await importEnv();
    expect(env.DATABASE_URL).toBe(THREE_VARS.DATABASE_URL);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("still reads OPENAI_API_KEY when it is set", async () => {
    stubProductionEnv({ ...THREE_VARS, OPENAI_API_KEY: "sk-test" });
    const { env } = await importEnv();
    expect(env.OPENAI_API_KEY).toBe("sk-test");
  });

  it("throws without AUTH_SECRET", async () => {
    stubProductionEnv({ ...THREE_VARS, AUTH_SECRET: undefined });
    await expect(importEnv()).rejects.toThrow(/invalid environment variables/i);
  });

  it("does not need Discord", async () => {
    stubProductionEnv(THREE_VARS);
    const { env } = await importEnv();
    expect(env.AUTH_DISCORD_ID).toBeUndefined();
  });

  it("throws on a DATABASE_ENCRYPTION_KEY that is not 32 bytes", async () => {
    stubProductionEnv({ ...THREE_VARS, DATABASE_ENCRYPTION_KEY: "too-short" });
    await expect(importEnv()).rejects.toThrow(/invalid environment variables/i);
  });

  it("accepts the optional email and scheduler settings", async () => {
    stubProductionEnv({
      ...THREE_VARS,
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "465",
      EMAIL_FROM: "auth@example.test",
      AUTH_LOG_SIGN_IN_CODES: "true",
      CRON_SECRET: "cron",
    });
    const { env } = await importEnv();
    expect(env.SMTP_HOST).toBe("smtp.example.test");
    expect(env.CRON_SECRET).toBe("cron");
  });
});
