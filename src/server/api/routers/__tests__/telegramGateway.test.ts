/**
 * Unit tests for `telegramGateway.initiatePairing`'s `/pair` body. The gateway
 * types `workspaceId` as optional, but the agent's knowledge tools throw "No
 * workspace in context" without it, so it must always be sent (Agent PRD D13).
 * Uses `mockDeep<PrismaClient>()` — no real DB, ever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("telegramGateway.initiatePairing — the /pair body (Agent PRD D13)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // humanOnlyProcedure reads the caller: a person, not an agent principal.
    dbMock.user.findUnique.mockImplementation(((args: { select?: Record<string, boolean> }) =>
      Promise.resolve(args.select?.isAgent ? { isAgent: false } : { defaultWorkspaceId: null })) as never);
    dbMock.telegramGatewaySession.upsert.mockResolvedValue({} as never);
    fetchMock = vi.fn().mockResolvedValue(
      okJson({ pairingCode: "A3F1B2", botUsername: "zoe_bot", expiresInSeconds: 600 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function pairBody(): Record<string, unknown> {
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/pair");
    return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
  }

  it("sends the person's Assistant and, with no default workspace, their Personal workspace", async () => {
    dbMock.assistant.findFirst.mockResolvedValue({ id: "asst-1", name: "Zoe" } as never);
    dbMock.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.telegramGateway.initiatePairing({});

    expect(result).toMatchObject({ pairingCode: "A3F1B2", deepLink: "https://t.me/zoe_bot?start=A3F1B2" });
    expect(pairBody()).toEqual({
      agentId: "assistant",
      assistantId: "asst-1",
      assistantName: "Zoe",
      workspaceId: "ws-personal",
    });
  });

  it("still sends a workspace for a person with no Assistant yet", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    dbMock.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.telegramGateway.initiatePairing({});

    expect(pairBody()).toMatchObject({ workspaceId: "ws-personal" });
    expect(pairBody()).not.toHaveProperty("assistantId");
  });
});
