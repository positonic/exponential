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

// Slow work runs in `after()`, once the response is sent. Outside a request
// scope `after` throws, so queue the callbacks and let a test run them with
// `flushAfter()` — which also proves the save returned first. Enrichment is
// stubbed so no vendor is called.
const { afterMock, afterQueue, triggerArticleMock } = vi.hoisted(() => {
  const afterQueue: Array<() => unknown> = [];
  return {
    afterQueue,
    afterMock: vi.fn((cb: () => unknown) => {
      afterQueue.push(cb);
    }),
    triggerArticleMock: vi.fn(),
  };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (cb: () => unknown) => afterMock(cb),
}));
vi.mock("~/server/services/youtubeSummary/triggerVideoArticle", () => ({
  triggerVideoArticle: triggerArticleMock,
}));
async function flushAfter(): Promise<void> {
  for (const cb of afterQueue.splice(0)) await cb();
}

import { createMockCaller } from "~/test/trpc-helpers";
import { alreadyInProjectFromError } from "~/server/services/resources/alreadyInProject";
import {
  readTransition,
  deriveContent,
  countWords,
  resaveReadStatus,
  saveReadState,
  pageTextToStore,
  MAX_RAW_CONTENT_CHARS,
  MAX_PAGE_TEXT_CHARS,
} from "../resource";

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
    // Who saved it, as the reads that return rows select it.
    user: { id: (overrides.userId as string | undefined) ?? "caller-1", name: "Owner" },
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

describe("resaveReadStatus", () => {
  it("brings a finished or queued item back to to_read on a plain re-save", () => {
    expect(resaveReadStatus("to_read", "read")).toBe("to_read");
    expect(resaveReadStatus("to_read", "to_read")).toBe("to_read");
  });

  it("does not interrupt an item mid-read", () => {
    expect(resaveReadStatus("to_read", "reading")).toBe("reading");
  });

  it("honours an explicit read or reading request", () => {
    expect(resaveReadStatus("read", "reading")).toBe("read");
    expect(resaveReadStatus("reading", "read")).toBe("reading");
  });
});

describe("saveReadState", () => {
  const queued = { forReference: false, readStatus: "to_read" as const };
  const reference = { forReference: true, readStatus: "to_read" as const };

  it("a new save lands on the requested state; for reference it starts read", () => {
    expect(saveReadState(queued, null)).toEqual({ readStatus: "to_read", readAt: null });
    const filed = saveReadState(reference, null);
    expect(filed.readStatus).toBe("read");
    expect(filed.readAt).toBeInstanceOf(Date);
  });

  it("a save for reference patches nothing on a Resource that exists, whatever its state", () => {
    const readAt = new Date("2026-09-01T00:00:00Z");
    expect(saveReadState(reference, { readStatus: "to_read", readAt: null })).toEqual({});
    expect(saveReadState(reference, { readStatus: "reading", readAt })).toEqual({});
    expect(saveReadState(reference, { readStatus: "read", readAt })).toEqual({});
  });

  it("any other re-save follows the queue rule", () => {
    const readAt = new Date("2026-09-01T00:00:00Z");
    expect(saveReadState(queued, { readStatus: "read", readAt })).toEqual({
      readStatus: "to_read",
      readAt: null,
    });
    expect(saveReadState(queued, { readStatus: "reading", readAt })).toEqual({
      readStatus: "reading",
      readAt,
    });
  });
});

describe("pageTextToStore", () => {
  it("keeps the text of a page that has no body", () => {
    expect(pageTextToStore("Villa\n€1,240 total", false)).toBe("Villa\n€1,240 total");
  });

  it("drops it when the save carries a body, and when it is blank or absent", () => {
    expect(pageTextToStore("Villa", true)).toBeNull();
    expect(pageTextToStore("  \n ", false)).toBeNull();
    expect(pageTextToStore(undefined, false)).toBeNull();
  });

  it("cuts text over the cap instead of refusing it", () => {
    expect(pageTextToStore("x".repeat(MAX_PAGE_TEXT_CHARS + 50), false)).toHaveLength(MAX_PAGE_TEXT_CHARS);
  });
});

describe("deriveContent / countWords", () => {
  it("keeps caller-supplied content untouched, even when empty", () => {
    expect(deriveContent({ content: "hi", rawContent: "<p>no</p>" })).toBe("hi");
    expect(deriveContent({ content: "" })).toBe("");
  });

  it("derives Markdown from article HTML when content is omitted", () => {
    const md = deriveContent({ rawContent: "<h1>Title</h1><p>Body <b>bold</b></p>" });
    expect(md).toContain("# Title");
    expect(md).toContain("**bold**");
  });

  it("yields nothing for a bare link", () => {
    expect(deriveContent({})).toBeUndefined();
    expect(countWords(undefined)).toBeNull();
    expect(countWords("   ")).toBeNull();
    expect(countWords("one two  three")).toBe(3);
  });
});

describe("resource router — reading list (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    embedResourceMock.mockReset();
    afterQueue.length = 0;
    embedResourceMock.mockResolvedValue(3);
    afterMock.mockClear();
    triggerArticleMock.mockReset();
    // No row for the URL unless a test says otherwise (dedupe, D-0027).
    dbMock.resource.findFirst.mockResolvedValue(null);
    // No workspace, so nothing is shared with the caller through a Project
    // unless a test says otherwise (ADR-0082).
    dbMock.workspace.findMany.mockResolvedValue([]);
  });

  describe("create", () => {
    it("starts a saved YouTube link's article job after the response", async () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "yt1", url }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({ title: "youtu.be", url, contentType: "bookmark", generateEmbeddings: false });

      expect(afterMock).toHaveBeenCalledTimes(1);
      expect(triggerArticleMock).not.toHaveBeenCalled();
      await flushAfter();
      expect(triggerArticleMock).toHaveBeenCalledWith("yt1");
    });

    it("does not start a job for other links, or for a video that already has an article", async () => {
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      dbMock.resource.create.mockResolvedValue(fakeResource());
      await caller.resource.create({ title: "A link", url: "https://example.com/post", contentType: "bookmark" });

      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const existing = fakeResource({ id: "yt2", url, contentType: "video", mimeType: "text/markdown" });
      dbMock.resource.findFirst.mockResolvedValue(existing);
      dbMock.resource.update.mockResolvedValue(existing);
      await caller.resource.create({ title: "youtube.com", url, contentType: "bookmark" });

      expect(afterMock).not.toHaveBeenCalled();
      expect(triggerArticleMock).not.toHaveBeenCalled();
    });

    it("re-saving a video summarised the old way starts a job, to give it an article", async () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const existing = fakeResource({ id: "old", url, contentType: "video", summary: "### Overview\nOld." });
      dbMock.resource.findFirst.mockResolvedValue(existing);
      dbMock.resource.update.mockResolvedValue(existing);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({ title: "youtube.com", url, contentType: "bookmark" });
      await flushAfter();

      expect(triggerArticleMock).toHaveBeenCalledWith("old");
    });

    it("re-saving a video's page keeps its article rather than storing a scrape of the page", async () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const existing = fakeResource({ id: "yt3", url, contentType: "video", mimeType: "text/markdown" });
      dbMock.resource.findFirst.mockResolvedValue(existing);
      dbMock.resource.update.mockResolvedValue(existing);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({
        title: "Some talk - YouTube",
        url,
        rawContent: "<p>Scraped watch page</p>",
        contentType: "web_page",
      });

      const data = dbMock.resource.update.mock.calls[0]![0].data;
      expect(data).not.toHaveProperty("content");
      expect(data).not.toHaveProperty("rawContent");
      expect(data).not.toHaveProperty("title");
      expect(afterMock).not.toHaveBeenCalled();
    });

    it("embeds a YouTube save's body and starts its job in one callback, body first, so they can't race", async () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "yt2", url }));
      const order: string[] = [];
      embedResourceMock.mockImplementation(async () => {
        order.push("embed");
        return 3;
      });
      triggerArticleMock.mockImplementation(async () => {
        order.push("enrich");
      });
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({ title: "A video", url, content: "pasted body", contentType: "bookmark" });

      // Next runs separate after() callbacks concurrently; the job re-embeds this row.
      expect(afterMock).toHaveBeenCalledTimes(1);
      await flushAfter();
      expect(order).toEqual(["embed", "enrich"]);
      expect(triggerArticleMock).toHaveBeenCalledWith("yt2");
    });

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

    it("a new Resource saved for reference starts read, outside the queue", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ readStatus: "read" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({
        title: "A listing",
        url: "https://example.com/listing",
        contentType: "bookmark",
        forReference: true,
      });

      const data = dbMock.resource.create.mock.calls[0]![0].data;
      expect(data.readStatus).toBe("read");
      expect(data.readAt).toBeInstanceOf(Date);
      expect(out.created).toBe(true);
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
      // The save returned before embedding started; it runs after the response.
      expect(embedResourceMock).not.toHaveBeenCalled();
      await flushAfter();
      expect(embedResourceMock).toHaveBeenCalledWith("r1");
    });

    it("returns the saved row even when embedding fails afterwards", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource());
      embedResourceMock.mockRejectedValue(new Error("embedding API down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({
        title: "Notes",
        content: "some pasted text",
        contentType: "note",
      });

      expect(out.created).toBe(true);
      await expect(flushAfter()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to embed resource r1 (create)"),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it("derives content and wordCount from article HTML and reports created: true", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "r2" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({
        title: "An article",
        url: "https://example.com/article",
        rawContent: "<h1>An article</h1><p>Four words right here.</p>",
        generateEmbeddings: false,
      });

      const data = dbMock.resource.create.mock.calls[0]![0].data;
      expect(data.rawContent).toContain("<h1>");
      expect(data.content).toContain("# An article");
      // Counted on the derived Markdown, so the heading marker is a token too.
      expect(data.wordCount).toBe(7);
      expect(data.readStatus).toBe("to_read");
      expect(out.created).toBe(true);
      // Opted out of the Knowledge index (D-0026).
      expect(embedResourceMock).not.toHaveBeenCalled();
    });

    it("embeds a derived body when the caller opts in", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "r3" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({
        title: "An article",
        url: "https://example.com/article",
        rawContent: "<p>text</p>",
        generateEmbeddings: true,
      });

      await flushAfter();
      expect(embedResourceMock).toHaveBeenCalledWith("r3");
    });

    it("rejects an article body over the cap instead of truncating it", async () => {
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.resource.create({
          title: "Huge",
          url: "https://example.com/huge",
          rawContent: "x".repeat(MAX_RAW_CONTENT_CHARS + 1),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.resource.create).not.toHaveBeenCalled();
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });

    describe("Page text (damp.gem)", () => {
      const url = "https://www.airbnb.com/rooms/53368445";
      const pageText = "Villa in Lanzarote\n€1,240 total\nFree cancellation";

      it("stores the text of a page with no Article body, and indexes it when asked", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "listing", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: true });

        const data = dbMock.resource.create.mock.calls[0]![0].data;
        expect(data).toMatchObject({ pageText, wordCount: null });
        expect(data.content).toBeUndefined();
        expect(data.rawContent).toBeUndefined();
        await flushAfter();
        expect(embedResourceMock).toHaveBeenCalledWith("listing");
      });

      it("is not indexed unless the save asks for the Knowledge index", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "listing", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: false });

        await flushAfter();
        expect(embedResourceMock).not.toHaveBeenCalled();
      });

      it("a save that carries both keeps the body and stores no Page text", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "article", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Post", url, rawContent: "<p>the article</p>", pageText });

        expect(dbMock.resource.create.mock.calls[0]![0].data).toMatchObject({
          content: "the article",
          pageText: null,
        });
      });

      it("cuts Page text over the cap and still saves", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "long", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        const out = await caller.resource.create({
          title: "Long",
          url,
          pageText: "x".repeat(MAX_PAGE_TEXT_CHARS + 1),
          generateEmbeddings: false,
        });

        expect(out.created).toBe(true);
        expect(dbMock.resource.create.mock.calls[0]![0].data.pageText).toHaveLength(MAX_PAGE_TEXT_CHARS);
      });

      it("saving the page again replaces the text and re-indexes it when indexing is on", async () => {
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({ id: "old", url, title: "airbnb.com", pageText: "€1,100 total" }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: true, forReference: true });

        expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({ title: "Villa", pageText });
        await flushAfter();
        expect(embedResourceMock).toHaveBeenCalledWith("old");
      });

      it("a Resource that has a body keeps it and takes no Page text", async () => {
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({ id: "old", url, title: "Kept", content: "the article", rawContent: "<p>the article</p>" }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: true });

        const data = dbMock.resource.update.mock.calls[0]![0].data;
        expect(data).not.toHaveProperty("pageText");
        expect(data).not.toHaveProperty("title");
        await flushAfter();
        expect(embedResourceMock).not.toHaveBeenCalled();
      });

      it("a body saved later replaces the Page text", async () => {
        dbMock.resource.findFirst.mockResolvedValue(fakeResource({ id: "old", url, pageText: "€1,100 total" }));
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Post", url, rawContent: "<p>the article</p>", generateEmbeddings: false });

        expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({
          content: "the article",
          pageText: null,
        });
      });

      it("no response carries Page text: not the reader's read, not the save's own reply", async () => {
        dbMock.resource.findFirst.mockResolvedValue(fakeResource({ id: "listing", url }));
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "listing", url }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.get({ id: "listing" });
        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: false });
        await caller.resource.update({ id: "listing", description: "For January" });

        expect(dbMock.resource.findFirst.mock.calls[0]![0]).toMatchObject({ omit: { pageText: true } });
        for (const call of dbMock.resource.update.mock.calls) {
          expect(call[0]).toMatchObject({ omit: { pageText: true } });
        }

        dbMock.resource.findFirst.mockResolvedValue(null);
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "new", url }));
        await caller.resource.create({ title: "Villa", url, pageText, generateEmbeddings: false });
        expect(dbMock.resource.create.mock.calls[0]![0]).toMatchObject({ omit: { pageText: true } });
      });
    });

    describe("identity and last-saved address (witty.otter)", () => {
      const LISTING = "https://www.airbnb.com/rooms/53368445";
      const JANUARY = `${LISTING}?adults=4&check_in=2027-01-25&check_out=2027-01-30&source_impression_id=p3_x`;
      const MARCH = `${LISTING}?adults=2&check_in=2027-03-01&check_out=2027-03-05&utm_source=mail`;

      it("a new save stores the visited address without tracking, and the page's identity", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "new" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "Villa", url: JANUARY, declaredUrl: LISTING, contentType: "bookmark" });

        expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({ userId: callerId, identity: LISTING });
        expect(dbMock.resource.create.mock.calls[0]![0].data).toMatchObject({
          url: `${LISTING}?adults=4&check_in=2027-01-25&check_out=2027-01-30`,
          identity: LISTING,
        });
      });

      it("the same listing saved with other dates updates the one Resource, whose link opens the second visit", async () => {
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({ id: "old", url: `${LISTING}?adults=4&check_in=2027-01-25&check_out=2027-01-30`, identity: LISTING }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        const out = await caller.resource.create({ title: "Villa", url: MARCH, declaredUrl: LISTING });

        expect(out.created).toBe(false);
        expect(dbMock.resource.create).not.toHaveBeenCalled();
        expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({ userId: callerId, identity: LISTING });
        expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({
          url: `${LISTING}?adults=2&check_in=2027-03-01&check_out=2027-03-05`,
          identity: LISTING,
        });
      });

      it("two searches stay two Resources when the site declares one generic address for both", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "new" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });
        const declaredUrl = "https://www.google.com/travel/flights";

        await caller.resource.create({ title: "ACE", url: "https://www.google.com/travel/flights/search?tfs=ACE", declaredUrl });
        await caller.resource.create({ title: "FNC", url: "https://www.google.com/travel/flights/search?tfs=FNC", declaredUrl });

        const matchedOn = dbMock.resource.findFirst.mock.calls.map((call) => (call[0]!.where as { identity: string }).identity);
        expect(matchedOn).toEqual([
          "https://www.google.com/travel/flights/search?tfs=ACE",
          "https://www.google.com/travel/flights/search?tfs=FNC",
        ]);
        expect(dbMock.resource.create).toHaveBeenCalledTimes(2);
      });

      it("ignores a declared URL on another host, and saves when it is not a URL at all", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "new" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });
        const url = "https://shop.example.com/item/9?ref=home";

        await caller.resource.create({ title: "Item", url, declaredUrl: "https://tracker.example.net/item/9" });
        await caller.resource.create({ title: "Item", url, declaredUrl: "/item/9" });

        for (const call of dbMock.resource.create.mock.calls) {
          expect(call[0].data).toMatchObject({ url, identity: url });
        }
      });

      it("a note with no URL has no identity and is never matched", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "note", url: null }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "A note", content: "pasted", contentType: "note", generateEmbeddings: false });

        expect(dbMock.resource.findFirst).not.toHaveBeenCalled();
        const data = dbMock.resource.create.mock.calls[0]![0].data;
        expect(data).not.toHaveProperty("url");
        expect(data).not.toHaveProperty("identity");
      });
    });

    describe("re-saving a URL already in the list (dedupe, D-0027)", () => {
      it("un-archives, returns to to_read, refreshes the body, and reports created: false", async () => {
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({
            id: "old",
            title: "example.com",
            readStatus: "read",
            readAt: new Date("2026-09-01T00:00:00Z"),
            archivedAt: new Date("2026-09-02T00:00:00Z"),
          }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        const out = await caller.resource.create({
          title: "The real title",
          url: "https://example.com/post",
          rawContent: "<p>fresh body</p>",
          generateEmbeddings: false,
        });

        expect(dbMock.resource.create).not.toHaveBeenCalled();
        expect(dbMock.resource.findFirst).toHaveBeenCalledWith({
          where: { userId: callerId, identity: "https://example.com/post" },
          orderBy: { updatedAt: "desc" },
        });
        const call = dbMock.resource.update.mock.calls[0]![0];
        expect(call.where).toEqual({ id: "old" });
        expect(call.data).toMatchObject({
          archivedAt: null,
          readStatus: "to_read",
          readAt: null,
          title: "The real title",
          rawContent: "<p>fresh body</p>",
          content: "fresh body",
          wordCount: 2,
        });
        expect(out.created).toBe(false);
        expect(embedResourceMock).not.toHaveBeenCalled();
      });

      it("does not interrupt an item that is mid-read", async () => {
        const firstRead = new Date("2026-09-01T00:00:00Z");
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({ id: "old", readStatus: "reading", readAt: firstRead }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "x", url: "https://example.com/post" });

        const data = dbMock.resource.update.mock.calls[0]![0].data;
        expect(data.readStatus).toBe("reading");
        expect(data.readAt).toEqual(firstRead);
      });

      it("a bare-link re-save keeps the existing title and body", async () => {
        dbMock.resource.findFirst.mockResolvedValue(
          fakeResource({ id: "old", title: "Kept", rawContent: "<p>kept</p>", content: "kept" }),
        );
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "example.com", url: "https://example.com/post" });

        const data = dbMock.resource.update.mock.calls[0]![0].data;
        expect(data).not.toHaveProperty("title");
        expect(data).not.toHaveProperty("content");
        expect(data).not.toHaveProperty("rawContent");
      });

      it("honours an explicit read request and re-embeds when asked", async () => {
        dbMock.resource.findFirst.mockResolvedValue(fakeResource({ id: "old" }));
        dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({
          title: "Reference",
          url: "https://example.com/post",
          content: "pasted reference text",
          readStatus: "read",
          generateEmbeddings: true,
        });

        const data = dbMock.resource.update.mock.calls[0]![0].data;
        expect(data.readStatus).toBe("read");
        expect(data.readAt).toBeInstanceOf(Date);
        await flushAfter();
        expect(embedResourceMock).toHaveBeenCalledWith("old");
      });

      describe("saved for reference (raw.hen)", () => {
        async function resaveForReference(existing: Record<string, unknown>) {
          dbMock.resource.findFirst.mockResolvedValue(fakeResource({ id: "old", ...existing }));
          dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
          const caller = createMockCaller({ userId: callerId, db: dbMock });

          const out = await caller.resource.create({
            title: "x",
            url: "https://example.com/post",
            forReference: true,
          });

          expect(out.created).toBe(false);
          return dbMock.resource.update.mock.calls[0]![0].data;
        }

        it("leaves a queued item to_read, so it stays in the queue", async () => {
          const data = await resaveForReference({ readStatus: "to_read", readAt: null });

          expect(data).not.toHaveProperty("readStatus");
          expect(data).not.toHaveProperty("readAt");
        });

        it("leaves an item mid-read, with its readAt untouched", async () => {
          const data = await resaveForReference({
            readStatus: "reading",
            readAt: new Date("2026-09-01T00:00:00Z"),
          });

          expect(data).not.toHaveProperty("readStatus");
          expect(data).not.toHaveProperty("readAt");
        });

        it("un-archives a finished item without putting it back in the queue", async () => {
          const data = await resaveForReference({
            readStatus: "read",
            readAt: new Date("2026-09-01T00:00:00Z"),
            archivedAt: new Date("2026-09-02T00:00:00Z"),
          });

          expect(data.archivedAt).toBeNull();
          expect(data).not.toHaveProperty("readStatus");
          expect(data).not.toHaveProperty("readAt");
        });

        it("is not overridden by a readStatus sent alongside it", async () => {
          dbMock.resource.findFirst.mockResolvedValue(
            fakeResource({ id: "old", readStatus: "to_read" }),
          );
          dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
          const caller = createMockCaller({ userId: callerId, db: dbMock });

          await caller.resource.create({
            title: "x",
            url: "https://example.com/post",
            forReference: true,
            readStatus: "read",
          });

          expect(dbMock.resource.update.mock.calls[0]![0].data).not.toHaveProperty("readStatus");
        });

        it("a save that states no intent still returns a finished item to the queue", async () => {
          dbMock.resource.findFirst.mockResolvedValue(
            fakeResource({ id: "old", readStatus: "read", readAt: new Date("2026-09-01T00:00:00Z") }),
          );
          dbMock.resource.update.mockResolvedValue(fakeResource({ id: "old" }));
          const caller = createMockCaller({ userId: callerId, db: dbMock });

          await caller.resource.create({ title: "x", url: "https://example.com/post" });

          expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({
            readStatus: "to_read",
            readAt: null,
          });
        });
      });

      it("only matches the caller's own rows", async () => {
        dbMock.resource.create.mockResolvedValue(fakeResource({ id: "mine" }));
        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await caller.resource.create({ title: "x", url: "https://example.com/post" });

        expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toMatchObject({ userId: callerId });
        expect(dbMock.resource.create).toHaveBeenCalledTimes(1);
      });
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
        AND: [{ OR: [{ workspaceId: "w1" }, { workspaceId: null }] }],
        archivedAt: null,
        readStatus: { in: ["to_read", "reading"] },
      });
    });

    it("a workspace view keeps the caller's no-workspace rows alongside a title search", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({ workspaceId: "w1", search: "pricing" });

      const where = dbMock.resource.findMany.mock.calls[0]![0]!.where!;
      expect(where.AND).toEqual([{ OR: [{ workspaceId: "w1" }, { workspaceId: null }] }]);
      expect(where.OR).toEqual([
        { title: { contains: "pricing", mode: "insensitive" } },
        { description: { contains: "pricing", mode: "insensitive" } },
      ]);
      expect(where).not.toHaveProperty("workspaceId");
    });

    it("without a workspace, lists every workspace's rows for the caller", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({});

      const where = dbMock.resource.findMany.mock.calls[0]![0]!.where!;
      expect(where).not.toHaveProperty("workspaceId");
      expect(where).not.toHaveProperty("AND");
    });

    it("a single status narrows to that status; omitted applies no read filter", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({ readStatus: "read" });
      expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toMatchObject({ readStatus: "read" });

      await caller.resource.list({});
      expect(dbMock.resource.findMany.mock.calls[1]![0]!.where).not.toHaveProperty("readStatus");
    });

    it("pages without losing the row at a page boundary", async () => {
      const all = Array.from({ length: 5 }, (_, i) => fakeResource({ id: `r${i}` }));
      dbMock.resource.findMany.mockImplementation(((args: { take: number; skip?: number; cursor?: { id: string } }) => {
        const start = args.cursor ? all.findIndex((row) => row.id === args.cursor!.id) + (args.skip ?? 0) : 0;
        return Promise.resolve(all.slice(start, start + args.take));
      }) as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const first = await caller.resource.list({ limit: 2 });
      const second = await caller.resource.list({ limit: 2, cursor: first.nextCursor });
      const third = await caller.resource.list({ limit: 2, cursor: second.nextCursor });

      expect([first, second, third].flatMap((page) => page.resources.map((r) => r.id))).toEqual([
        "r0", "r1", "r2", "r3", "r4",
      ]);
      expect(third.nextCursor).toBeUndefined();
    });

    it("returns readStatus and readAt on every row", async () => {
      dbMock.resource.findMany.mockResolvedValue([fakeResource()]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({});

      const select = dbMock.resource.findMany.mock.calls[0]![0]!.select!;
      expect(select).toMatchObject({ readStatus: true, readAt: true });
    });
  });

  describe("identities (sly.breeze)", () => {
    const entry = (overrides: Record<string, unknown> = {}) => ({
      id: "r1",
      identity: "https://example.com/post",
      title: "A link",
      workspaceId: "w1",
      readStatus: "to_read",
      project: { id: "p1", name: "Travel" },
      user: { id: callerId, name: "Caller" },
      ...overrides,
    });

    it("returns one entry per unarchived Resource with an identity, for the caller only", async () => {
      dbMock.resource.findMany.mockResolvedValue([entry()] as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.identities();

      const args = dbMock.resource.findMany.mock.calls[0]![0]!;
      expect(args.where).toEqual({ userId: callerId, archivedAt: null, identity: { not: null } });
      expect(args.orderBy).toEqual({ id: "asc" });
      expect(out.items).toEqual([
        {
          id: "r1",
          identity: "https://example.com/post",
          title: "A link",
          workspaceId: "w1",
          project: { id: "p1", name: "Travel" },
          owner: { id: callerId, name: "Caller" },
          isMine: true,
          readStatus: "to_read",
        },
      ]);
      expect(out.nextCursor).toBeUndefined();
    });

    it("never returns anyone else's read state", async () => {
      dbMock.resource.findMany.mockResolvedValue([
        entry({ id: "theirs", readStatus: "reading", user: { id: "teammate", name: "Teammate" } }),
      ] as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.identities();

      expect(out.items[0]).toMatchObject({
        isMine: false,
        readStatus: null,
        owner: { id: "teammate", name: "Teammate" },
      });
    });

    it("accepts no URL, identity or page content", async () => {
      dbMock.resource.findMany.mockResolvedValue([] as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.identities({
        limit: 10,
        // Unknown keys are stripped, never used: nothing here can narrow the read to a page.
        ...({ url: "https://example.com/post", identity: "https://example.com/post", title: "A link" } as object),
      });

      expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toEqual({
        userId: callerId,
        archivedAt: null,
        identity: { not: null },
      });
    });

    it("hands an account with 5,000 Resources the complete list through the cursor", async () => {
      const all = Array.from({ length: 5000 }, (_, i) => entry({ id: `r${String(i).padStart(4, "0")}` }));
      dbMock.resource.findMany.mockImplementation(((args: { take: number; skip?: number; cursor?: { id: string } }) => {
        const start = args.cursor ? all.findIndex((row) => row.id === args.cursor!.id) + (args.skip ?? 0) : 0;
        return Promise.resolve(all.slice(start, start + args.take));
      }) as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await caller.resource.identities(cursor ? { cursor } : undefined);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor);

      expect(seen).toHaveLength(5000);
      expect(new Set(seen).size).toBe(5000);
      expect(pages).toBe(5);
    });
  });

  describe("filing shares (perky.nova, ADR-0082)", () => {
    // The caller is in workspace w1, so Resources filed under its Projects can reach them.
    const sharedW1 = expect.objectContaining({ workspaceId: "w1" }) as unknown;
    const ownOrShared = { OR: [{ userId: callerId }, { OR: [sharedW1] }] };
    const teammates = fakeResource({ id: "theirs", userId: "teammate", projectId: "p1", readStatus: "reading", readAt: new Date() });

    beforeEach(() => {
      dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
      dbMock.project.findUnique.mockResolvedValue({
        createdById: callerId,
        teamId: null,
        workspaceId: "w1",
        isPublic: false,
        isRestricted: false,
      } as never);
    });

    it("the reader opens a Resource the caller can see, with its saver and without the owner's read state", async () => {
      dbMock.resource.findFirst.mockResolvedValue(teammates);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.get({ id: "theirs" });

      expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({ id: "theirs", ...ownOrShared });
      expect(out.resource).toMatchObject({
        id: "theirs",
        isMine: false,
        owner: { id: "teammate", name: "Owner" },
        readStatus: null,
        readAt: null,
      });
      expect(out.resource).not.toHaveProperty("user");
    });

    it("a Project's list is everything filed there that the caller may see, each with who saved it", async () => {
      dbMock.resource.findMany.mockResolvedValue([teammates, fakeResource({ id: "mine", projectId: "p1" })]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.list({ projectId: "p1" });

      const where = dbMock.resource.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
      expect(where).not.toHaveProperty("userId");
      expect(where.projectId).toBe("p1");
      expect(where.AND).toEqual([{ OR: [{ userId: callerId }, { AND: [{ projectId: "p1" }, { OR: [sharedW1] }] }] }]);
      expect(out.resources.map((r) => [r.id, r.isMine, r.readStatus])).toEqual([
        ["theirs", false, null],
        ["mine", true, "to_read"],
      ]);
    });

    it("every other list stays the caller's own: the Knowledge page, and the Reading list even inside a Project", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.list({ workspaceId: "w1" });
      await caller.resource.list({ projectId: "p1", readStatus: "unread" });

      for (const call of dbMock.resource.findMany.mock.calls) {
        expect(call[0]!.where).toMatchObject({ userId: callerId });
      }
      expect(dbMock.workspace.findMany).not.toHaveBeenCalled();
    });

    it("the identities read includes Resources in Projects the caller can see", async () => {
      dbMock.resource.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.identities();

      expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toEqual({
        ...ownOrShared,
        archivedAt: null,
        identity: { not: null },
      });
    });

    it("every write looks only at the caller's own rows, so a shared Resource is not theirs to change", async () => {
      dbMock.resource.findFirst.mockResolvedValue(null);
      dbMock.resource.updateMany.mockResolvedValue({ count: 0 });
      dbMock.resource.deleteMany.mockResolvedValue({ count: 0 });
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const refused = { code: "NOT_FOUND" } satisfies Partial<TRPCError>;

      await expect(caller.resource.update({ id: "theirs", description: "x" })).rejects.toMatchObject(refused);
      await expect(caller.resource.setReadStatus({ id: "theirs", readStatus: "read" })).rejects.toMatchObject(refused);
      await expect(caller.resource.setPinned({ id: "theirs", pinned: true })).rejects.toMatchObject(refused);
      await expect(caller.resource.regenerateEmbeddings({ id: "theirs" })).rejects.toMatchObject(refused);
      await expect(caller.resource.archive({ id: "theirs" })).rejects.toMatchObject(refused);
      await expect(caller.resource.unarchive({ id: "theirs" })).rejects.toMatchObject(refused);
      await expect(caller.resource.delete({ id: "theirs" })).rejects.toMatchObject(refused);

      const wheres = [
        ...dbMock.resource.findFirst.mock.calls.map((call) => call[0]!.where),
        ...dbMock.resource.updateMany.mock.calls.map((call) => call[0].where),
        ...dbMock.resource.deleteMany.mock.calls.map((call) => call[0]!.where),
      ];
      expect(wheres).toHaveLength(7);
      for (const where of wheres) expect(where).toEqual({ id: "theirs", userId: callerId });
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });

    it("filing puts the Resource in the Project's workspace, on a save and on a move", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "new" }));
      dbMock.workspaceUser.count.mockResolvedValue(1);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await caller.resource.create({ title: "x", url: "https://example.com/a", projectId: "p1", workspaceId: "elsewhere" });
      expect(dbMock.resource.create.mock.calls[0]![0].data).toMatchObject({ projectId: "p1", workspaceId: "w1" });

      dbMock.resource.findFirst.mockResolvedValue(fakeResource({ id: "mine", workspaceId: "home", projectId: null }));
      dbMock.resource.update.mockResolvedValue(fakeResource({ id: "mine", workspaceId: "w1", projectId: "p1" }));
      await caller.resource.update({ id: "mine", projectId: "p1" });
      expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({ projectId: "p1", workspaceId: "w1" });
      // Its index entries go with it, so the Project's members can find it.
      expect(dbMock.knowledgeChunk.updateMany).toHaveBeenCalledWith({
        where: { sourceType: "resource", sourceId: "mine" },
        data: { projectId: "p1", workspaceId: "w1" },
      });
    });
  });

  describe("a page is filed once per Project (keen.quill)", () => {
    const url = "https://www.airbnb.com/rooms/53368445";
    const theirs = { id: "theirs", title: "Villa", user: { id: "teammate", name: "James" } };
    const already = { resourceId: "theirs", title: "Villa", projectId: "p1", owner: { id: "teammate", name: "James" } };

    beforeEach(() => {
      dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
      dbMock.workspaceUser.count.mockResolvedValue(1);
      dbMock.project.findUnique.mockResolvedValue({
        createdById: callerId,
        teamId: null,
        workspaceId: "w1",
        isPublic: false,
        isRestricted: false,
      } as never);
    });

    /** The caller has no Resource for the page; a teammate's is filed under p1. */
    function teammateFiledIt() {
      dbMock.resource.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(theirs as never);
    }

    it("refuses a save for reference, naming the Resource and who saved it, matched by identity", async () => {
      teammateFiledIt();
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const error = await caller.resource
        .create({ title: "Villa", url: `${url}?check_in=2027-03-01&utm_source=mail`, declaredUrl: url, projectId: "p1", forReference: true })
        .then(() => null, (thrown: unknown) => thrown);

      expect(error).toMatchObject({ code: "CONFLICT", message: "Already in this project, saved by James" });
      expect(alreadyInProjectFromError(error)).toEqual(already);
      expect(dbMock.resource.findFirst.mock.calls[1]![0]!.where).toMatchObject({
        AND: [expect.anything(), { identity: url, archivedAt: null, userId: { not: callerId } }],
      });
      expect(dbMock.resource.create).not.toHaveBeenCalled();
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });

    it("an explicit read request is a save for reference too", async () => {
      teammateFiledIt();
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.resource.create({ title: "Villa", url, projectId: "p1", readStatus: "read" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("with the Reading list requested, saves the caller's own Resource with no Project and reports the one already there", async () => {
      teammateFiledIt();
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "mine", projectId: null }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({ title: "Villa", url, projectId: "p1", workspaceId: "w1" });

      const data = dbMock.resource.create.mock.calls[0]![0].data;
      expect(data).toMatchObject({ workspaceId: "w1", readStatus: "to_read", userId: callerId });
      expect(data.projectId).toBeUndefined();
      expect(out).toMatchObject({ created: true, alreadyInProject: already });
    });

    it("leaves the caller's own Resource where it is filed when the Reading list is requested", async () => {
      dbMock.resource.findFirst
        .mockResolvedValueOnce(fakeResource({ id: "mine", projectId: "elsewhere", workspaceId: "w9", readStatus: "read" }))
        .mockResolvedValueOnce(theirs as never);
      dbMock.resource.update.mockResolvedValue(fakeResource({ id: "mine", projectId: "elsewhere", workspaceId: "w9" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({ title: "Villa", url, projectId: "p1", workspaceId: "w1" });

      const data = dbMock.resource.update.mock.calls[0]![0].data;
      expect(data).not.toHaveProperty("projectId");
      expect(data).not.toHaveProperty("workspaceId");
      expect(data).toMatchObject({ readStatus: "to_read" });
      expect(out).toMatchObject({ created: false, alreadyInProject: already });
    });

    it("does not look for a second filing when the caller's own Resource is already in the Project", async () => {
      dbMock.resource.findFirst.mockResolvedValueOnce(fakeResource({ id: "mine", projectId: "p1" }));
      dbMock.resource.update.mockResolvedValue(fakeResource({ id: "mine", projectId: "p1" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({ title: "Villa", url, projectId: "p1", forReference: true });

      expect(dbMock.resource.findFirst).toHaveBeenCalledTimes(1);
      expect(out).toMatchObject({ created: false, alreadyInProject: null });
    });

    it("bringing back an archived Resource whose place a teammate has since taken unfiles it, without refusing the save", async () => {
      dbMock.resource.findFirst
        .mockResolvedValueOnce(fakeResource({ id: "mine", projectId: "p1", archivedAt: new Date("2026-11-01T00:00:00Z") }))
        .mockResolvedValueOnce(theirs as never);
      dbMock.resource.update.mockResolvedValue(fakeResource({ id: "mine", projectId: null }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      // No Project named: just the page, saved again for reference.
      const out = await caller.resource.create({ title: "Villa", url, forReference: true });

      expect(dbMock.resource.update.mock.calls[0]![0].data).toMatchObject({ archivedAt: null, projectId: null });
      expect(out).toMatchObject({ created: false, alreadyInProject: already });
    });

    it("an archived Resource comes back into its Project when nobody else has filed the page there", async () => {
      dbMock.resource.findFirst
        .mockResolvedValueOnce(fakeResource({ id: "mine", projectId: "p1", archivedAt: new Date("2026-11-01T00:00:00Z") }))
        .mockResolvedValueOnce(null);
      dbMock.resource.update.mockResolvedValue(fakeResource({ id: "mine", projectId: "p1" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({ title: "Villa", url, forReference: true });

      expect(dbMock.resource.update.mock.calls[0]![0].data).not.toHaveProperty("projectId");
      expect(out.alreadyInProject).toBeNull();
    });

    it("refuses a move into a Project that already lists the page, and moves nothing", async () => {
      dbMock.resource.findFirst
        .mockResolvedValueOnce(fakeResource({ id: "mine", identity: url, projectId: null }))
        .mockResolvedValueOnce(theirs as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const error = await caller.resource
        .update({ id: "mine", projectId: "p1" })
        .then(() => null, (thrown: unknown) => thrown);

      expect(error).toMatchObject({ code: "CONFLICT" });
      expect(alreadyInProjectFromError(error)).toEqual(already);
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });

    it("a save with no Project never asks", async () => {
      dbMock.resource.create.mockResolvedValue(fakeResource({ id: "mine" }));
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.create({ title: "Villa", url, forReference: true });

      expect(dbMock.resource.findFirst).toHaveBeenCalledTimes(1);
      expect(out.alreadyInProject).toBeNull();
    });
  });

  describe("unfile (woody.wolf)", () => {
    const filed = { id: "theirs", userId: "teammate", projectId: "p1", workspaceId: "w1" };
    const project = (overrides: Record<string, unknown> = {}) =>
      ({ createdById: "teammate", teamId: null, workspaceId: "w1", isPublic: false, isRestricted: false, ...overrides }) as never;

    beforeEach(() => {
      dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
      dbMock.resource.findFirst.mockResolvedValue(filed as never);
      dbMock.resource.update.mockResolvedValue({ id: "theirs", projectId: null, workspaceId: "w1" } as never);
    });

    it("a Project editor takes someone else's Resource out of the Project and changes nothing else", async () => {
      dbMock.project.findUnique.mockResolvedValue(project());
      dbMock.workspaceUser.findUnique.mockResolvedValue({ role: "member" } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      const out = await caller.resource.unfile({ id: "theirs" });

      expect(out).toEqual({ id: "theirs", projectId: null, unfiled: true });
      expect(dbMock.resource.update.mock.calls[0]![0]).toMatchObject({
        where: { id: "theirs" },
        data: { projectId: null },
      });
      // Its index entries leave the Project too, so its text is no longer found by the members.
      expect(dbMock.knowledgeChunk.updateMany).toHaveBeenCalledWith({
        where: { sourceType: "resource", sourceId: "theirs" },
        data: { projectId: null, workspaceId: "w1" },
      });
    });

    it("refuses a member who can see the Project but not edit it", async () => {
      dbMock.project.findUnique.mockResolvedValue(project());
      dbMock.workspaceUser.findUnique.mockResolvedValue({ role: "viewer" } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(caller.resource.unfile({ id: "theirs" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.resource.update).not.toHaveBeenCalled();
    });

    it("looks only among Resources the caller can see", async () => {
      dbMock.resource.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(caller.resource.unfile({ id: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toMatchObject({
        id: "theirs",
        OR: [{ userId: callerId }, expect.anything()],
      });
    });

    it("the owner unfiles their own without needing edit access to the Project", async () => {
      dbMock.resource.findFirst.mockResolvedValue({ ...filed, userId: callerId } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(caller.resource.unfile({ id: "theirs" })).resolves.toMatchObject({ unfiled: true });
      expect(dbMock.project.findUnique).not.toHaveBeenCalled();
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

/**
 * ADR-0079: under an agent (an `exp_agent_…` key or an Assistant) the router
 * works on the OWNER's Resources, inside the workspaces delegated to the agent,
 * and records the agent as the author.
 */
describe("resource router — agent works on its owner's list (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const SHADOW_ID = "shadow-1";
  const OWNER_ID = "owner-1";
  const AGENT_ID = "agent-1";

  const agentCaller = () =>
    createMockCaller({ userId: SHADOW_ID, db: dbMock, tokenType: "agent-key" });

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    embedResourceMock.mockReset();
    afterQueue.length = 0;
    dbMock.resource.findFirst.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    dbMock.externalAgent.findUnique.mockResolvedValue({ id: AGENT_ID, ownerId: OWNER_ID } as never);
    // The owner delegated w1 to the agent; both are members of it.
    dbMock.workspaceUser.findMany.mockResolvedValue([{ workspaceId: "w1" }] as never);
    dbMock.workspaceUser.count.mockResolvedValue(2);
  });

  it("saves into the owner's list and records the agent as author", async () => {
    dbMock.resource.create.mockResolvedValue(fakeResource({ userId: OWNER_ID }));

    await agentCaller().resource.create({
      title: "A link",
      url: "https://example.com/post",
      contentType: "bookmark",
      workspaceId: "w1",
      generateEmbeddings: false,
    });

    const data = dbMock.resource.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: OWNER_ID, createdByAgentId: AGENT_ID, workspaceId: "w1" });
    expect(dbMock.workspaceUser.count).toHaveBeenCalledWith({
      where: { workspaceId: "w1", userId: { in: [SHADOW_ID, OWNER_ID] } },
    });
    // Dedupe looks only at the owner's rows the agent can reach.
    expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({
      userId: OWNER_ID,
      workspaceId: { in: ["w1"] },
      identity: "https://example.com/post",
    });
  });

  it("matches a page saved from another address only inside its delegated workspaces", async () => {
    dbMock.resource.create.mockResolvedValue(fakeResource({ userId: OWNER_ID }));

    await agentCaller().resource.create({
      title: "A listing",
      url: "https://www.airbnb.com/rooms/53368445?adults=2&utm_source=mail",
      declaredUrl: "https://www.airbnb.com/rooms/53368445",
      contentType: "bookmark",
      workspaceId: "w1",
      generateEmbeddings: false,
    });

    expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({
      userId: OWNER_ID,
      workspaceId: { in: ["w1"] },
      identity: "https://www.airbnb.com/rooms/53368445",
    });
  });

  it("refuses a save with no workspace", async () => {
    await expect(
      agentCaller().resource.create({ title: "A link", url: "https://example.com/post" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(dbMock.resource.create).not.toHaveBeenCalled();
  });

  it("refuses a workspace the agent and its owner do not both belong to", async () => {
    dbMock.workspaceUser.count.mockResolvedValue(1);

    await expect(
      agentCaller().resource.create({ title: "A link", url: "https://example.com/post", workspaceId: "w2" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
    expect(dbMock.resource.create).not.toHaveBeenCalled();
  });

  it("lists the owner's rows in delegated workspaces, never no-workspace rows", async () => {
    dbMock.resource.findMany.mockResolvedValue([]);

    await agentCaller().resource.list({ readStatus: "unread", workspaceId: "w1" });

    const where = dbMock.resource.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({
      userId: OWNER_ID,
      workspaceId: { in: ["w1"] },
      AND: [{ OR: [{ workspaceId: "w1" }, { workspaceId: null }] }],
      readStatus: { in: ["to_read", "reading"] },
    });
  });

  it("fetches the identities of the owner's Resources in delegated workspaces only", async () => {
    dbMock.resource.findMany.mockResolvedValue([
      {
        id: "r1",
        identity: "https://example.com/post",
        title: "A link",
        workspaceId: "w1",
        readStatus: "to_read",
        project: null,
        user: { id: OWNER_ID, name: "Owner" },
      },
    ] as never);

    const out = await agentCaller().resource.identities();

    expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toEqual({
      userId: OWNER_ID,
      workspaceId: { in: ["w1"] },
      archivedAt: null,
      identity: { not: null },
    });
    // The list is the owner's, so its entries are "mine" to the agent keeping it.
    expect(out.items[0]).toMatchObject({ isMine: true, readStatus: "to_read" });
  });

  it("gains no view of other people's shared Resources (ADR-0082 leaves an agent's reach alone)", async () => {
    dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
    dbMock.resource.findMany.mockResolvedValue([]);
    dbMock.resource.findFirst.mockResolvedValue(null);
    // A Project both the agent and its owner pass the gate of.
    dbMock.project.findUnique.mockResolvedValue({
      createdById: OWNER_ID,
      teamId: null,
      workspaceId: "w1",
      isPublic: true,
      isRestricted: false,
    } as never);
    const own = { userId: OWNER_ID, workspaceId: { in: ["w1"] } };

    await agentCaller().resource.identities();
    await agentCaller().resource.list({ projectId: "p1" });
    await expect(agentCaller().resource.get({ id: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(dbMock.resource.findMany.mock.calls[0]![0]!.where).toEqual({ ...own, archivedAt: null, identity: { not: null } });
    expect(dbMock.resource.findMany.mock.calls[1]![0]!.where).toMatchObject(own);
    expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({ id: "theirs", ...own });
  });

  it("keeps its owner's own copy in a delegated workspace when the Project already lists the page", async () => {
    dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
    dbMock.project.findUnique.mockResolvedValue({
      createdById: OWNER_ID,
      teamId: null,
      workspaceId: "w1",
      isPublic: true,
      isRestricted: false,
    } as never);
    // The agent and its owner are both members of w1, so both may edit the Project.
    dbMock.workspaceUser.findUnique.mockResolvedValue({ role: "member" } as never);
    dbMock.resource.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "theirs", title: "Villa", user: { id: "teammate", name: "James" } } as never);
    dbMock.resource.create.mockResolvedValue(fakeResource({ userId: OWNER_ID }));

    // A Project and no workspace named, and the Reading list asked for by default.
    await agentCaller().resource.create({ title: "Villa", url: "https://example.com/villa", projectId: "p1" });

    const data = dbMock.resource.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: OWNER_ID, workspaceId: "w1" });
    expect(data.projectId).toBeUndefined();
  });

  it("unfiles only its owner's Resources, never one a teammate filed", async () => {
    dbMock.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);
    dbMock.resource.findFirst.mockResolvedValue(null);

    await expect(agentCaller().resource.unfile({ id: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(dbMock.resource.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: "theirs",
      userId: OWNER_ID,
      workspaceId: { in: ["w1"] },
    });
  });

  it("marks read only on the owner's rows it can reach", async () => {
    dbMock.resource.findFirst.mockResolvedValue(fakeResource({ userId: OWNER_ID }));
    dbMock.resource.update.mockResolvedValue(fakeResource({ readStatus: "read" }));

    await agentCaller().resource.setReadStatus({ id: "r1", readStatus: "read" });

    expect(dbMock.resource.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1", userId: OWNER_ID, workspaceId: { in: ["w1"] } },
      }),
    );
  });

  it("cannot move a Resource out of its delegated workspaces", async () => {
    dbMock.resource.findFirst.mockResolvedValue(fakeResource({ userId: OWNER_ID }));

    await expect(
      agentCaller().resource.update({ id: "r1", workspaceId: "w2" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
    await expect(
      agentCaller().resource.update({ id: "r1", workspaceId: null }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(dbMock.resource.update).not.toHaveBeenCalled();
  });

  it("a person still saves to their own list with no agent author", async () => {
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    dbMock.resource.create.mockResolvedValue(fakeResource());
    const caller = createMockCaller({ userId: "caller-1", db: dbMock, tokenType: "api-token" });

    await caller.resource.create({ title: "A link", url: "https://example.com/post" });

    const data = dbMock.resource.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: "caller-1", createdByAgentId: null });
    expect(dbMock.workspaceUser.findMany).not.toHaveBeenCalled();
  });
});
