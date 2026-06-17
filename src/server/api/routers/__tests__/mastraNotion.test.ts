/**
 * Unit tests for the `mastra.notionSearch` proxy (ADR-0020).
 *
 * Exercises the proxy through the full tRPC caller via `createMockCaller`, with
 * `mockDeep<PrismaClient>()` (no real DB) and a mocked `NotionService` (no
 * network). Asserts: unauthenticated calls reject, the proxy forwards
 * userId/workspaceId into the server-side credential lookup, and the service's
 * `{connected}`-discriminated result passes through unchanged.
 *
 * Harness mirrors `github.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

const { notionSearchMock, notionQueryMock, notionGetPageMock, notionCreateMock, notionUpdateMock } =
  vi.hoisted(() => ({
    notionSearchMock: vi.fn(),
    notionQueryMock: vi.fn(),
    notionGetPageMock: vi.fn(),
    notionCreateMock: vi.fn(),
    notionUpdateMock: vi.fn(),
  }));

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

// Mock the SDK wrapper so resolved credentials never hit the network.
vi.mock("~/server/services/NotionService", () => ({
  NotionService: class {
    search = notionSearchMock;
    queryDatabase = notionQueryMock;
    getPageWithBlocks = notionGetPageMock;
    createPage = notionCreateMock;
    updatePage = notionUpdateMock;
    // Static helper used by notionAgentService for the row/page title.
    static extractTitleFromProperties(properties: Record<string, any>): string {
      for (const value of Object.values(properties)) {
        if (value && typeof value === "object" && value.type === "title") {
          return value.title?.map((t: any) => t.plain_text).join("") || "Untitled";
        }
      }
      return "Untitled";
    }
  },
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
import { createCaller } from "~/server/api/root";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

/** Return a Notion integration row with a usable plaintext token credential. */
function mockNotionIntegration(
  dbMock: DeepMockProxy<PrismaClient>,
  workspaceId: string | null = null,
) {
  dbMock.integration.findFirst.mockResolvedValue({
    id: "int-1",
    provider: "notion",
    userId: USER_ID,
    workspaceId,
    credentials: [{ key: "secret-token", keyType: "access_token", isEncrypted: false }],
  } as never);
}

describe("mastra.notionSearch (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    notionSearchMock.mockReset();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller({ db: dbMock, session: null, headers: new Headers() });
    await expect(
      caller.mastra.notionSearch({ query: "payments" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(notionSearchMock).not.toHaveBeenCalled();
  });

  it("forwards userId + workspaceId into the server-side credential lookup", async () => {
    mockNotionIntegration(dbMock, WORKSPACE_ID);
    notionSearchMock.mockResolvedValue({ results: [], hasMore: false });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.mastra.notionSearch({ query: "payments", workspaceId: WORKSPACE_ID });

    // First lookup is the workspace-scoped credential resolution.
    expect(dbMock.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "notion",
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
        }),
      }),
    );
  });

  it("passes the connected result through unchanged", async () => {
    mockNotionIntegration(dbMock, null);
    const hit = { id: "p1", type: "page", title: "Payments", url: "https://notion.so/p1" };
    notionSearchMock.mockResolvedValue({ results: [hit], hasMore: true });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionSearch({ query: "payments" });

    expect(result).toEqual({
      connected: true,
      total: 1,
      results: [hit],
      hasMore: true,
    });
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionSearch({ query: "payments" });

    expect(result).toEqual({ connected: false });
    expect(notionSearchMock).not.toHaveBeenCalled();
  });
});

describe("mastra.notionQueryDatabase (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    notionQueryMock.mockReset();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller({ db: dbMock, session: null, headers: new Headers() });
    await expect(
      caller.mastra.notionQueryDatabase({ databaseId: "db-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(notionQueryMock).not.toHaveBeenCalled();
  });

  it("returns the projected, capped result through the service", async () => {
    mockNotionIntegration(dbMock, null);
    notionQueryMock.mockResolvedValue({
      results: [
        {
          id: "r1",
          url: "https://notion.so/r1",
          properties: {
            Name: { type: "title", title: [{ plain_text: "Rent" }] },
            Amount: { type: "number", number: 1200 },
          },
        },
      ],
      hasMore: true,
      nextCursor: "cur-2",
    });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionQueryDatabase({ databaseId: "db-1" });

    expect(result).toEqual({
      connected: true,
      total: 1,
      hasMore: true,
      nextCursor: "cur-2",
      rows: [
        { id: "r1", title: "Rent", url: "https://notion.so/r1", props: { Amount: 1200 } },
      ],
    });
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    expect(await caller.mastra.notionQueryDatabase({ databaseId: "db-1" })).toEqual({
      connected: false,
    });
    expect(notionQueryMock).not.toHaveBeenCalled();
  });
});

describe("mastra.notionGetPage (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    notionGetPageMock.mockReset();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller({ db: dbMock, session: null, headers: new Headers() });
    await expect(
      caller.mastra.notionGetPage({ pageId: "pg-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(notionGetPageMock).not.toHaveBeenCalled();
  });

  it("returns the lean page result (title + flattened text) through the service", async () => {
    mockNotionIntegration(dbMock, null);
    notionGetPageMock.mockResolvedValue({
      page: {
        id: "pg-1",
        url: "https://notion.so/pg-1",
        properties: { Name: { type: "title", title: [{ plain_text: "Notes" }] } },
      },
      blocks: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "hello world" }] } }],
    });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionGetPage({ pageId: "pg-1" });

    expect(result).toEqual({
      connected: true,
      id: "pg-1",
      title: "Notes",
      url: "https://notion.so/pg-1",
      text: "hello world",
      truncated: false,
    });
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    expect(await caller.mastra.notionGetPage({ pageId: "pg-1" })).toEqual({
      connected: false,
    });
    expect(notionGetPageMock).not.toHaveBeenCalled();
  });
});

describe("mastra.notionCreatePage (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    notionCreateMock.mockReset();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller({ db: dbMock, session: null, headers: new Headers() });
    await expect(
      caller.mastra.notionCreatePage({ databaseId: "db-1", title: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(notionCreateMock).not.toHaveBeenCalled();
  });

  it("performs the write and returns the lean confirmation", async () => {
    mockNotionIntegration(dbMock, null);
    notionCreateMock.mockResolvedValue({
      id: "new-1",
      title: "Groceries",
      url: "https://notion.so/new-1",
      properties: {},
    });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionCreatePage({ databaseId: "db-1", title: "Groceries" });

    expect(result).toEqual({
      connected: true,
      id: "new-1",
      url: "https://notion.so/new-1",
      title: "Groceries",
    });
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    expect(
      await caller.mastra.notionCreatePage({ databaseId: "db-1", title: "x" }),
    ).toEqual({ connected: false });
    expect(notionCreateMock).not.toHaveBeenCalled();
  });
});

describe("mastra.notionUpdatePage (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    notionUpdateMock.mockReset();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller({ db: dbMock, session: null, headers: new Headers() });
    await expect(
      caller.mastra.notionUpdatePage({ pageId: "pg-1", properties: {} }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(notionUpdateMock).not.toHaveBeenCalled();
  });

  it("performs the write and returns the page id", async () => {
    mockNotionIntegration(dbMock, null);
    notionUpdateMock.mockResolvedValue(undefined);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.mastra.notionUpdatePage({
      pageId: "pg-1",
      properties: { Status: { status: { name: "Done" } } },
    });

    expect(result).toEqual({ connected: true, id: "pg-1" });
    expect(notionUpdateMock).toHaveBeenCalledWith({
      pageId: "pg-1",
      properties: { Status: { status: { name: "Done" } } },
    });
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    expect(
      await caller.mastra.notionUpdatePage({ pageId: "pg-1", properties: {} }),
    ).toEqual({ connected: false });
    expect(notionUpdateMock).not.toHaveBeenCalled();
  });
});
