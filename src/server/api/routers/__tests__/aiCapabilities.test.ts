/**
 * `ai.getCapabilities`: the public query the UI reads to hide or explain AI
 * surfaces. Booleans only — never a key or URL.
 *
 * The module graph is loaded with NO `OPENAI_API_KEY` and no `openai` mock:
 * the whole tRPC router (root.ts) must import cleanly on a keyless self-host
 * install. Before smoky.anvil three module-scope OpenAI clients threw here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MASTRA_API_URL;
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

// Auth's Next-only imports don't resolve under vitest; stub them as the other
// router unit tests do. Nothing LLM-related is mocked.
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

const AI_VARS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "MASTRA_API_URL"] as const;

function anonymousCaller() {
  return createCaller({ db: mockDeep<PrismaClient>(), session: null, headers: new Headers() });
}

describe("ai.getCapabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("on a keyless production install, reports every AI capability off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const name of AI_VARS) vi.stubEnv(name, "");

    await expect(anonymousCaller().ai.getCapabilities()).resolves.toEqual({
      openai: false,
      anthropic: false,
      assistant: false,
      summaries: false,
      voice: false,
    });
  });

  it("with every key set (exponential.im), reports every AI capability on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("MASTRA_API_URL", "https://mastra.example.test");

    const capabilities = await anonymousCaller().ai.getCapabilities();

    expect(capabilities).toEqual({
      openai: true,
      anthropic: true,
      assistant: true,
      summaries: true,
      voice: true,
    });
    expect(JSON.stringify(capabilities)).not.toMatch(/sk-|mastra\.example/);
  });
});
