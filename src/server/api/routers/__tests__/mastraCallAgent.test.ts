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
        // A retired Assistant (ADR-0072) never lends its persona.
        where: expect.objectContaining({ id: ASSISTANT_ID, createdById: USER_ID, retiredAt: null }),
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

describe("mastra.callAgent — metering a direct call (billing V1)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const originalMode = process.env.BILLING_MODE;

  /** A one-step gpt-4o-mini reply: 2,000 prompt tokens of which 1,000 cached, 500 out. */
  const REPLY = {
    text: "Your health score dipped this month.",
    usage: {
      inputTokens: 2_000,
      outputTokens: 500,
      cachedInputTokens: 1_000,
      raw: {
        inputTokens: { total: 2_000, noCache: 1_000, cacheRead: 1_000, cacheWrite: 0 },
        outputTokens: { total: 500 },
      },
    },
    response: { modelId: "gpt-4o-mini" },
  };
  // 1,000 × $0.15/M + 1,000 × $0.075/M + 500 × $0.60/M = 0.00015 + 0.000075 + 0.0003
  const REPLY_COST_MICROS = 525;

  function mastraReplies(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
  }

  const recordedEvents = () => dbMock.usageEvent.create.mock.calls.map(([args]) => args.data);
  const call = (workspaceId?: string) =>
    createMockCaller({ userId: USER_ID, db: dbMock }).mastra.callAgent({
      agentId: "zoeAgent",
      workspaceId,
      messages: [{ role: "user", content: "How is my wheel of life?" }],
    });

  beforeEach(() => {
    process.env.BILLING_MODE = "meter";
    dbMock = getDbMock();
    mockReset(dbMock);
    mastraReplies(REPLY);
    dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);
    dbMock.aiInteractionHistory.create.mockResolvedValue({ id: "log-1" } as never);
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalMode;
    vi.unstubAllGlobals();
  });

  it("records one priced event against the caller's workspace, pointing at the logged interaction", async () => {
    dbMock.workspaceUser.findFirst.mockResolvedValue({
      workspace: { slug: "acme", name: "Acme", type: "team" },
    } as never);

    const result = await call("ws-acme");

    expect(result.response).toBe(REPLY.text);
    await vi.waitFor(() => expect(recordedEvents()).toHaveLength(1));
    expect(recordedEvents()[0]).toEqual({
      workspaceId: "ws-acme",
      source: "DIRECT",
      modelId: "gpt-4o-mini",
      costMicros: REPLY_COST_MICROS,
      onOwnKey: false,
      refId: "log-1",
    });
  });

  it("meters a call with no workspace to the caller's Personal workspace", async () => {
    dbMock.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await call();

    await vi.waitFor(() => expect(recordedEvents()).toHaveLength(1));
    expect(recordedEvents()[0]).toMatchObject({ workspaceId: "ws-personal", costMicros: REPLY_COST_MICROS });
  });

  it("never meters to a workspace the caller named but does not belong to", async () => {
    dbMock.workspaceUser.findFirst.mockResolvedValue(null as never);
    dbMock.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await call("ws-someone-elses");

    await vi.waitFor(() => expect(recordedEvents()).toHaveLength(1));
    expect(recordedEvents()[0]).toMatchObject({ workspaceId: "ws-personal" });
  });

  it("logs the turn's real cost and cache traffic on the interaction", async () => {
    dbMock.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await call();

    const logged = dbMock.aiInteractionHistory.create.mock.calls[0]?.[0].data as { tokenUsage?: string; model?: string };
    expect(logged.model).toBe("gpt-4o-mini");
    expect(JSON.parse(logged.tokenUsage ?? "{}")).toMatchObject({
      prompt: 2_000,
      completion: 500,
      total: 2_500,
      cost: 0.000525,
      cacheReadInput: 1_000,
    });
  });

  it("returns the reply and records nothing on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    const result = await call();

    expect(result.response).toBe(REPLY.text);
    await vi.waitFor(() => expect(dbMock.aiInteractionHistory.create).toHaveBeenCalled());
    expect(recordedEvents()).toEqual([]);
    expect(dbMock.workspace.findFirst).not.toHaveBeenCalled();
  });
});
