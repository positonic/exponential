/**
 * Unit tests for the `resource` router's reading-list behaviour
 * (ticket pink.grape): the read-state filter on `list`, the
 * `setReadStatus` transition, and the invariant that indexing follows
 * content — a bare URL saved "to read" never reaches the Knowledge index.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` plus a mocked
 * KnowledgeService — no real database, ever (see CLAUDE.md "Test database
 * safety"). Mirrors the test layout from `document.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

const { embedResourceMock } = vi.hoisted(() => ({
  embedResourceMock: vi.fn(),
}));
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({
    embedResource: embedResourceMock,
    deleteChunks: vi.fn(),
    getChunkCount: vi.fn().mockResolvedValue(0),
  }),
}));

import { createMockCaller } from "~/test/trpc-helpers";
import { readTransition } from "../resource";

function fakeResource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "r1",
    title: "A link",
    description: null,
    url: "https://example.com/post",
    content: null,
    rawContent: null,
    contentType: "bookmark",
    tags: [],
    userId: "caller-1",
    projectId: null,
    workspaceId: "w1",
    pinnedAsContext: false,
    readStatus: "to_read",
    readAt: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    archivedAt: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("readTransition", () => {
  it("stamps readAt the first time a resource is marked read", () => {
    const out = readTransition("read", "to_read", null);
    expect(out.readStatus).toBe("read");
    expect(out.readAt).toBeInstanceOf(Date);
  });

  it("keeps the original readAt when re-saving an already-read resource", () => {
    const first = new Date("2026-09-01T00:00:00Z");
    expect(readTransition("read", "read", first)).toEqual({ readStatus: "read", readAt: first });
  });

  it("clears readAt only when a resource goes back to to_read", () => {
    const first = new Date("2026-09-01T00:00:00Z");
    expect(readTransition("to_read", "read", first)).toEqual({ readStatus: "to_read", readAt: null });
  });

  it("keeps the first-read date when a finished item is picked up again", () => {
    const first = new Date("2026-09-01T00:00:00Z");
    expect(readTransition("reading", "read", first)).toEqual({ readStatus: "reading", readAt: first });
    expect(readTransition("reading", "to_read", null)).toEqual({ readStatus: "reading", readAt: null });
  });
});

describe("resource router — reading list (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    embedResourceMock.mockReset();
    embedResourceMock.mockResolvedValue(3);
  });

  describe("create", () => {
    it("saves a bare URL as to_read and never embeds it (indexing follows content)", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource());
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({
        title: "A link",
        url: "https://example.com/post",
        contentType: "bookmark",
      });

      expect(dbMock.resource.create).toHaveBeenCalledTimes(1);
      const data = dbMock.resource.create.mock.calls[0]![0].data;
      expect(data.readStatus).toBe("to_read");
      expect(data.readAt).toBeNull();
      expect(embedResourceMock).not.toHaveBeenCalled();
    });

    it("embeds pasted content as before, and stamps readAt when saved as read", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ readStatus: "read" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({
        title: "Notes",
        content: "some pasted text",
        contentType: "note",
        readStatus: "read",
      });

      const data = dbMock.resource.create.mock.calls[0]![0].data;
      expect(data.readStatus).toBe("read");
      expect(data.readAt).toBeInstanceOf(Date);
      expect(embedResourceMock).toHaveBeenCalledWith("r1");
    });
  });

  describe("list", () => {
    it("'unread' narrows to to_read + reading, unarchived, for the caller only", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({ readStatus: "unread", workspaceId: "w1" });

      const where = dbMock.resource.findMany.mock.calls[0]![0]!.where!;
      expect(where).toMatchObject({
        userId: callerId,
        workspaceId: "w1",
        archivedAt: null,
        readStatus: { in: ["to_read", "reading"] },
      });
    });

    it("a single status narrows to that status; omitted applies no read filter", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({ readStatus: "read" });
      expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toMatchObject({ readStatus: "read" });

      await caller.resource.list({});
      expect(dbMock.resource.findMany.mock.calls[1]![0]!.where).not.toHaveProperty("readStatus");
    });

    it("returns readStatus and readAt on every row", async () => {
      dbMock.resource.findMany.mockResolvedValue([fakeResource()]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({});

      const select = dbMock.resource.findMany.mock.calls[0]![0]!.select!;
      expect(select).toMatchObject({ readStatus: true, readAt: true });
    });
  });

  describe("setReadStatus", () => {
    it("marks read with a readAt stamp and touches nothing else", async () => {
      dbMock.resource.findFirst.mockResolvedValue(fakeResource());
      dbMock.resource.update.mockResolvedValue(fakeResource({ readStatus: "read", readAt: new Date() }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.setReadStatus({ id: "r1", readStatus: "read" });

      expect(out.readStatus).toBe("read");
      const args = dbMock.resource.update.mock.calls[0]![0];
      expect(args.where).toEqual({ id: "r1" });
      expect(Object.keys(args.data).sort()).toEqual(["readAt", "readStatus"]);
      expect(args.data.readAt).toBeInstanceOf(Date);
      expect(embedResourceMock).not.toHaveBeenCalled();
    });

    it("refuses a resource the caller does not own", async () => {
      dbMock.resource.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.resource.setReadStatus({ id: "someone-elses", readStatus: "read" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);

      expect(dbMock.resource.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "someone-elses", userId: callerId } }),
      );
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("applies a readStatus change through the same transition as setReadStatus", async () => {
      dbMock.resource.findFirst.mockResolvedValue(fakeResource());
      dbMock.resource.update.mockResolvedValue(fakeResource({ readStatus: "read" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.update({ id: "r1", title: "Renamed", readStatus: "read" });

      const data = dbMock.resource.update.mock.calls[0]![0].data;
      expect(data).toMatchObject({ title: "Renamed", readStatus: "read" });
      expect(data.readAt).toBeInstanceOf(Date);
      // No content change → no re-embed.
      expect(embedResourceMock).not.toHaveBeenCalled();
    });
  });
});
