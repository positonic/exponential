/**
 * Unit tests for the calendar router's ICS feed CRUD (ADR-0057).
 *
 * Mocked Prisma via `mockDeep<PrismaClient>()` — no real DB. The SSRF guard
 * and sync service are mocked at the module boundary (both do network I/O);
 * their own behaviour is covered by the calendar service tests. What's pinned
 * here: the URL is encrypted at rest and never returned, removal is scoped to
 * the owner, and an unsafe URL never creates a row.
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
  // Real 32-byte key — addFeed genuinely encrypts, and the test decrypts.
  process.env.DATABASE_ENCRYPTION_KEY = "MMeRcJFimqp98NsQ5i2cawtF4LbcftnfiCNJWLhO/YQ=";
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

const { assertSafeFeedUrlMock, syncFeedMock } = vi.hoisted(() => ({
  assertSafeFeedUrlMock: vi.fn(),
  syncFeedMock: vi.fn(),
}));

vi.mock("~/server/services/calendar/feedUrlGuard", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("~/server/services/calendar/feedUrlGuard")
  >();
  return { ...original, assertSafeFeedUrl: assertSafeFeedUrlMock };
});

vi.mock("~/server/services/calendar/CalendarSyncService", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("~/server/services/calendar/CalendarSyncService")
  >();
  return { ...original, syncFeed: syncFeedMock };
});

import { createMockCaller } from "~/test/trpc-helpers";
import { decryptFromBase64 } from "~/server/utils/encryption";
import { UnsafeFeedUrlError } from "~/server/services/calendar/feedUrlGuard";

const FEED_URL = "https://outlook.office365.com/owa/calendar/abc/calendar.ics";

describe("calendar router — ICS feeds (mocked)", () => {
  const userId = "user-1";
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    assertSafeFeedUrlMock.mockReset().mockResolvedValue(undefined);
    syncFeedMock.mockReset().mockResolvedValue({ ok: true, eventCount: 0 });
  });

  describe("addFeed", () => {
    it("encrypts the URL at rest and runs the inline first sync", async () => {
      dbMock.calendarFeed.create.mockResolvedValue({ id: "feed-1" } as never);
      dbMock.calendarFeed.findUniqueOrThrow.mockResolvedValue({
        id: "feed-1",
        name: "My feed",
        timezone: null,
        isEnabled: true,
        syncStatus: "ok",
        lastSyncedAt: new Date(),
        lastSyncError: null,
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.addFeed({ url: FEED_URL, name: "My feed" });

      expect(res.id).toBe("feed-1");
      const createArg = dbMock.calendarFeed.create.mock.calls[0]![0] as {
        data: { userId: string; urlEncrypted: string };
      };
      expect(createArg.data.userId).toBe(userId);
      // Ciphertext, not the URL — and it round-trips back to the URL.
      expect(createArg.data.urlEncrypted).not.toContain("outlook.office365.com");
      expect(decryptFromBase64(createArg.data.urlEncrypted)).toBe(FEED_URL);
      expect(syncFeedMock).toHaveBeenCalledWith(expect.anything(), "feed-1");
    });

    it("rejects an unsafe URL without creating a row", async () => {
      assertSafeFeedUrlMock.mockRejectedValue(
        new UnsafeFeedUrlError("That address is on a private or loopback network"),
      );

      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.addFeed({ url: "https://169.254.169.254/latest" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(dbMock.calendarFeed.create).not.toHaveBeenCalled();
      expect(syncFeedMock).not.toHaveBeenCalled();
    });

    it("keeps the feed row and reports its error status when the first sync fails", async () => {
      syncFeedMock.mockResolvedValue({ ok: false, error: "HTTP 404" });
      dbMock.calendarFeed.create.mockResolvedValue({ id: "feed-1" } as never);
      dbMock.calendarFeed.findUniqueOrThrow.mockResolvedValue({
        id: "feed-1",
        name: "outlook.office365.com",
        timezone: null,
        isEnabled: true,
        syncStatus: "error",
        lastSyncedAt: null,
        lastSyncError: "HTTP 404",
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.addFeed({ url: FEED_URL });

      expect(res.syncStatus).toBe("error");
      expect(res.lastSyncError).toBe("HTTP 404");
    });
  });

  describe("listFeeds", () => {
    it("scopes to the caller and never selects the encrypted URL", async () => {
      dbMock.calendarFeed.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId, db: dbMock });
      await caller.calendar.listFeeds();

      const arg = dbMock.calendarFeed.findMany.mock.calls[0]![0] as {
        where: { userId: string };
        select: Record<string, boolean>;
      };
      expect(arg.where.userId).toBe(userId);
      expect(arg.select.urlEncrypted).toBeUndefined();
    });
  });

  describe("removeFeed", () => {
    it("deletes with the owner scoping baked into the where", async () => {
      dbMock.calendarFeed.deleteMany.mockResolvedValue({ count: 1 } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.removeFeed({ feedId: "feed-1" });

      expect(res.success).toBe(true);
      expect(dbMock.calendarFeed.deleteMany).toHaveBeenCalledWith({
        where: { id: "feed-1", userId },
      });
    });

    it("404s when the feed belongs to someone else (zero rows deleted)", async () => {
      dbMock.calendarFeed.deleteMany.mockResolvedValue({ count: 0 } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      await expect(caller.calendar.removeFeed({ feedId: "not-mine" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
