/**
 * Unit tests for the shared reverse-link scan (`findLinkingPages`) as seen
 * through `page.parentCrumb` and `page.deleteImpact`.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). The two things worth pinning: the
 * `::text` LIKE pre-filter is only a pre-filter, so a candidate that merely
 * mentions the id in prose must be rejected by the `collectPageLinkIds`
 * confirmation; and view access is pushed into the candidate query, so a page
 * the caller cannot see never reaches either count.
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
const WORKSPACE_ID = "ws-1";
const PAGE_ID = "page-target";

/** A body that links to `targetId` via a real `pageLink` node. */
const docLinkingTo = (targetId: string) => ({
  type: "doc",
  content: [{ type: "pageLink", attrs: { pageId: targetId } }],
});

/** A body that only *mentions* the id in prose — the LIKE pre-filter matches
 * it, the `collectPageLinkIds` confirmation must not. */
const docMentioning = (targetId: string) => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: `see ${targetId}` }] },
  ],
});

/** The page under test, plus the workspace-member access it resolves through. */
function mockTargetPage(
  dbMock: DeepMockProxy<PrismaClient>,
  opts: { isPublic?: boolean; bodyDoc?: unknown } = {},
) {
  dbMock.knowledgePage.findUnique.mockResolvedValue({
    id: PAGE_ID,
    createdById: USER_ID,
    projectId: null,
    workspaceId: WORKSPACE_ID,
    docVersion: 0,
  } as never);
  dbMock.knowledgePage.findUniqueOrThrow.mockResolvedValue({
    bodyDoc: opts.bodyDoc ?? { type: "doc", content: [] },
    isPublic: opts.isPublic ?? false,
  } as never);
}

describe("page reverse-link scan (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("parentCrumb", () => {
    it("returns the newest-edited page that really links here", async () => {
      mockTargetPage(dbMock);
      // Raw query order is newest-edited first; the first row only mentions
      // the id in prose, so the second is the real parent.
      dbMock.$queryRaw.mockResolvedValue([
        { id: "mentions-only" },
        { id: "real-parent" },
      ] as never);
      dbMock.knowledgePage.findMany.mockResolvedValue([
        {
          id: "real-parent",
          title: "Real parent",
          isPublic: false,
          bodyDoc: docLinkingTo(PAGE_ID),
        },
        {
          id: "mentions-only",
          title: "Just a mention",
          isPublic: false,
          bodyDoc: docMentioning(PAGE_ID),
        },
      ] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.page.parentCrumb({ id: PAGE_ID })).resolves.toEqual({
        id: "real-parent",
        title: "Real parent",
      });
    });

    it("returns null when nothing links here", async () => {
      mockTargetPage(dbMock);
      dbMock.$queryRaw.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.page.parentCrumb({ id: PAGE_ID }),
      ).resolves.toBeNull();
    });
  });

  describe("deleteImpact", () => {
    it("counts linkers and sub-pages and reports the public URL", async () => {
      mockTargetPage(dbMock, {
        isPublic: true,
        bodyDoc: {
          type: "doc",
          content: [
            { type: "pageLink", attrs: { pageId: "child-a" } },
            { type: "pageLink", attrs: { pageId: "child-b" } },
          ],
        },
      });
      dbMock.$queryRaw.mockResolvedValue([{ id: "linker-1" }] as never);
      dbMock.knowledgePage.findMany.mockResolvedValue([
        {
          id: "linker-1",
          title: "Linker",
          isPublic: false,
          bodyDoc: docLinkingTo(PAGE_ID),
        },
      ] as never);
      dbMock.knowledgePage.count.mockResolvedValue(2 as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.page.deleteImpact({ id: PAGE_ID })).resolves.toEqual({
        linkedFromCount: 1,
        subpageCount: 2,
        isPublic: true,
      });
    });

    it("does not count a candidate the caller cannot view", async () => {
      mockTargetPage(dbMock);
      dbMock.$queryRaw.mockResolvedValue([{ id: "hidden-linker" }] as never);
      // The access WHERE is part of the candidate query, so an unviewable
      // linker simply doesn't come back.
      dbMock.knowledgePage.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.page.deleteImpact({ id: PAGE_ID })).resolves.toEqual({
        linkedFromCount: 0,
        subpageCount: 0,
        isPublic: false,
      });
      // No sub-page links in the body, so no count query at all.
      expect(dbMock.knowledgePage.count).not.toHaveBeenCalled();
    });
  });
});
