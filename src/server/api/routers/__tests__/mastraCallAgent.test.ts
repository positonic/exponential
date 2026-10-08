/**
 * Unit tests for `mastra.callAgent`'s assistant lookup.
 *
 * `assistantId` is client-supplied and the matching row's personality /
 * instructions / userContext are injected verbatim into the agent's system
 * prompt. Assistants are owner-scoped (see the "scope assistants to their
 * owner" fix in PR 536, applied to the streaming route), so the lookup MUST be
 * filtered by `createdById` — otherwise any caller who knows another user's
 * assistant id can pull that assistant's instructions into their own run.
 *
 * Runs through the full tRPC caller via `createMockCaller` with a
 * `mockDeep<PrismaClient>()` and a stubbed global `fetch` (no Mastra network).
 * Harness mirrors `mastraNotion.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
const OTHER_USER_ID = "user-2";
const ASSISTANT_ID = "asst-1";

interface MastraGenerateBody {
  messages: Array<{ role: string; content: string }>;
}

/** Stub `fetch` so the Mastra generate call never leaves the process. */
function stubMastraFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ text: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Return the parsed JSON body and URL of the single Mastra generate call. */
function generateCall(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) as MastraGenerateBody };
}

describe("mastra.callAgent — assistant lookup is owner-scoped", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    fetchMock = stubMastraFetch();
    // Neither test supplies a workspace/project, and the Slack identity lookup
    // is a plain findFirst that may resolve null.
    dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);
    dbMock.aiInteractionHistory.create.mockResolvedValue({ id: "log-1" } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters the assistant lookup by the caller's createdById", async () => {
    dbMock.assistant.findFirst.mockResolvedValue({
      id: ASSISTANT_ID,
      name: "Mine",
      emoji: null,
      personality: "Warm",
      instructions: "Always say hi",
      userContext: null,
      createdById: USER_ID,
    } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.mastra.callAgent({
      agentId: "zoeAgent",
      assistantId: ASSISTANT_ID,
      messages: [{ role: "user", content: "hello" }],
    });

    // The lookup must be a findFirst (findUnique cannot carry the owner
    // filter) and must include the caller's id — never the bare assistant id.
    expect(dbMock.assistant.findFirst).toHaveBeenCalledTimes(1);
    expect(dbMock.assistant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ASSISTANT_ID, createdById: USER_ID }),
      }),
    );
    expect(dbMock.assistant.findUnique).not.toHaveBeenCalled();

    // A resolved assistant routes to assistantAgent with the personality
    // overlay prepended as the first system message.
    const { url, body } = generateCall(fetchMock);
    expect(url).toContain("/api/agents/assistantAgent/generate");
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0]?.content).toContain("Always say hi");
  });

  it("does not inject another user's assistant when the owner-scoped lookup misses", async () => {
    // Owner-scoped lookup returns nothing for an id that belongs to someone
    // else — simulate the DB honouring the createdById filter.
    dbMock.assistant.findFirst.mockImplementation((async (args: {
      where: { id?: string; createdById?: string };
    }) => {
      const ownedBy = OTHER_USER_ID;
      return args.where.createdById === ownedBy
        ? { id: ASSISTANT_ID, name: "Theirs", instructions: "SECRET", createdById: ownedBy }
        : null;
    }) as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.mastra.callAgent({
      agentId: "zoeAgent",
      assistantId: ASSISTANT_ID,
      messages: [{ role: "user", content: "hello" }],
    });

    expect(dbMock.assistant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdById: USER_ID }),
      }),
    );

    // Falls through to the requested agent with no personality overlay.
    const { url, body } = generateCall(fetchMock);
    expect(url).toContain("/api/agents/zoeAgent/generate");
    expect(body.messages.some((m) => m.content.includes("SECRET"))).toBe(false);
    expect(body.messages.some((m) => m.content.includes("# Your Identity"))).toBe(false);
  });
});
