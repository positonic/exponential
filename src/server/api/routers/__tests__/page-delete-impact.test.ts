/**
 * The shared reverse-link scan (`findLinkingPages`) as seen through
 * `page.parentCrumb` and `page.deleteImpact`, plus the `PageLink` derivation
 * that feeds it.
 *
 * Mocked Prisma (no real DB, see CLAUDE.md "Test database safety"), but the
 * page queries are answered by evaluating the router's own `where` clauses
 * against an in-memory workspace with `matchesWhere`, so these tests say which
 * pages a query admits, not merely which clause it sent. Each page's outgoing
 * links are derived from its body with `collectPageLinkIds`, the same function
 * `syncPageLinks` indexes with.
 *
 * The two rules worth pinning: a page that only *mentions* the id (in prose,
 * or as a pasted URL) is not a linker, and a linker the caller cannot view is
 * neither returned nor counted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { JSONContent } from "@tiptap/core";

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
import { matchesWhere } from "~/test/prismaWhere";
import { collectPageLinkIds } from "~/lib/pages/public-doc";
import { syncPageLinks } from "~/server/services/pages/page-links";

const WORKSPACE_ID = "ws-1";
const TARGET = "page-target";
const ME = "user-me";
const SOMEONE = "user-someone";
const WS_VIEWER = "user-ws-viewer";

const ROLES: Record<string, string> = { [ME]: "member", [SOMEONE]: "member", [WS_VIEWER]: "viewer" };

/** A body that links to `targetId` with a real `pageLink` node. */
const linkingTo = (...targetIds: string[]): JSONContent => ({
  type: "doc",
  content: targetIds.map((pageId) => ({ type: "pageLink", attrs: { pageId } })),
});

/** A body that only *mentions* the id: once in prose, once as a pasted URL
 * (a `link` mark whose href ends in the id). Neither is a `pageLink`. */
const mentioning = (targetId: string): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: `see ${targetId} and ` },
        {
          type: "text",
          text: "this page",
          marks: [{ type: "link", attrs: { href: `/w/acme/pages/${targetId}` } }],
        },
      ],
    },
  ],
});

interface SeedPage {
  id: string;
  title?: string;
  createdById?: string;
  /** Restricted (ADR-0069/0080): only the owner and grantees can see it. */
  isInviteOnly?: boolean;
  isPublic?: boolean;
  bodyDoc?: JSONContent;
  updatedAt: number;
}

type Row = Record<string, unknown>;

/**
 * An in-memory workspace shaped the way the access `where` clauses walk it.
 * `linksFrom` / `linksTo` are derived from the bodies with the indexer's own
 * `collectPageLinkIds`, mirroring what `syncPageLinks` writes.
 */
function buildWorkspace(seed: SeedPage[]): Row[] {
  const outgoing = new Map(
    seed.map((p) => [
      p.id,
      collectPageLinkIds(p.bodyDoc ?? null).filter((to) => to !== p.id),
    ]),
  );
  const rows: Row[] = seed.map((p) => ({
    id: p.id,
    title: p.title ?? p.id,
    isPublic: p.isPublic ?? false,
    workspaceId: WORKSPACE_ID,
    createdById: p.createdById ?? ME,
    isInviteOnly: p.isInviteOnly ?? false,
    projectId: null,
    project: null,
    databaseId: null,
    database: null,
    members: [],
    docVersion: 0,
    workspace: {
      members: Object.keys(ROLES).map((userId) => ({ userId, role: ROLES[userId] })),
      teams: [],
    },
    linksFrom: (outgoing.get(p.id) ?? []).map((toPageId) => ({ toPageId })),
    linksTo: [] as Array<{ fromPageId: string; from: Row }>,
    updatedAt: new Date(p.updatedAt),
  }));
  // Each incoming link carries its linking page, so a filter on the linker
  // (`linksTo: { none: { from: … } }`) sees that page's access and workspace.
  const rowById = new Map(rows.map((row) => [row.id as string, row]));
  for (const row of rows) {
    row.linksTo = seed
      .filter((from) => (outgoing.get(from.id) ?? []).includes(row.id as string))
      .map((from) => ({ fromPageId: from.id, from: rowById.get(from.id)! }));
  }
  return rows;
}

function install(db: DeepMockProxy<PrismaClient>, rows: Row[]) {
  const byId = (id: unknown) => rows.find((r) => r.id === id) ?? null;
  db.knowledgePage.findUnique.mockImplementation((({ where }: { where: { id: string } }) =>
    Promise.resolve(byId(where.id))) as never);
  db.knowledgePage.findUniqueOrThrow.mockImplementation((({ where }: { where: { id: string } }) =>
    Promise.resolve(byId(where.id))) as never);
  db.knowledgePage.findMany.mockImplementation((({
    where,
    take,
  }: {
    where: Record<string, unknown>;
    take?: number;
  }) =>
    Promise.resolve(
      rows
        .filter((r) => matchesWhere(r, where))
        .sort((a, b) => (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime())
        .slice(0, take ?? rows.length)
        .map((r) => ({ id: r.id, title: r.title, isPublic: r.isPublic })),
    )) as never);
  db.knowledgePage.count.mockImplementation((({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(rows.filter((r) => matchesWhere(r, where)).length)) as never);
  // The per-page resolver behind ensurePageAccess.
  db.workspaceUser.findUnique.mockImplementation((({
    where,
  }: {
    where: { userId_workspaceId?: { userId: string } };
  }) => {
    const role = ROLES[where.userId_workspaceId?.userId ?? ""];
    return Promise.resolve(role ? { role, workspaceId: WORKSPACE_ID } : null);
  }) as never);
  db.teamUser.findMany.mockResolvedValue([]);
  db.knowledgePageMember.findUnique.mockResolvedValue(null);
}

describe("the reverse-link scan (findLinkingPages)", () => {
  const db = getDbMock();
  beforeEach(() => mockReset(db));

  it("does not count a page that only mentions the id in prose or as a pasted URL", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, updatedAt: 1 },
        { id: "mentioner", bodyDoc: mentioning(TARGET), updatedAt: 3 },
        { id: "real-linker", title: "Real linker", bodyDoc: linkingTo(TARGET), updatedAt: 2 },
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });

    // The mentioner is the newest-edited page and still not the parent.
    await expect(caller.page.parentCrumb({ id: TARGET })).resolves.toEqual({
      id: "real-linker",
      title: "Real linker",
    });
    expect((await caller.page.deleteImpact({ id: TARGET })).linkedFromCount).toBe(1);
  });

  it("never returns or counts a linker the caller cannot view", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, updatedAt: 1 },
        // Someone else's restricted page with no grant for me: newest, but hidden.
        {
          id: "hidden-linker",
          createdById: SOMEONE,
          isInviteOnly: true,
          bodyDoc: linkingTo(TARGET),
          updatedAt: 3,
        },
        { id: "visible-linker", title: "Visible", bodyDoc: linkingTo(TARGET), updatedAt: 2 },
      ]),
    );
    const me = createMockCaller({ userId: ME, db });
    await expect(me.page.parentCrumb({ id: TARGET })).resolves.toEqual({
      id: "visible-linker",
      title: "Visible",
    });
    expect((await me.page.deleteImpact({ id: TARGET })).linkedFromCount).toBe(1);

    // Its owner sees both, newest first.
    const owner = createMockCaller({ userId: SOMEONE, db });
    await expect(owner.page.parentCrumb({ id: TARGET })).resolves.toEqual({
      id: "hidden-linker",
      title: "hidden-linker",
    });
  });

  it("returns null when nothing links here", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, updatedAt: 1 },
        { id: "other", bodyDoc: mentioning(TARGET), updatedAt: 2 },
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });
    await expect(caller.page.parentCrumb({ id: TARGET })).resolves.toBeNull();
  });

  it("indexes pageLink nodes only: a prose mention writes no PageLink row", async () => {
    await syncPageLinks(db, "mentioner", mentioning(TARGET));
    expect(db.pageLink.deleteMany).toHaveBeenCalledWith({ where: { fromPageId: "mentioner" } });
    expect(db.$executeRaw).not.toHaveBeenCalled();

    await syncPageLinks(db, "linker", linkingTo(TARGET));
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    // The target ids are a bind parameter of the INSERT … unnest(...).
    expect(db.$executeRaw.mock.calls[0]).toContainEqual([TARGET]);
  });
});

describe("page.deleteImpact", () => {
  const db = getDbMock();
  beforeEach(() => mockReset(db));

  it("states the linkers, the sub-pages that become top-level, and the public URL", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, isPublic: true, bodyDoc: linkingTo("only-child", "shared-child"), updatedAt: 1 },
        { id: "only-child", updatedAt: 1 },
        // Linked from another page too, so it keeps a parent in the tree.
        { id: "shared-child", updatedAt: 1 },
        { id: "other-parent", bodyDoc: linkingTo("shared-child"), updatedAt: 1 },
        { id: "linker", bodyDoc: linkingTo(TARGET), updatedAt: 2 },
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });
    await expect(caller.page.deleteImpact({ id: TARGET })).resolves.toEqual({
      linkedFromCount: 1,
      linkedFromCapped: false,
      subpageCount: 1,
      isPublic: true,
    });
  });

  it("counts a sub-page whose only other linker is hidden from the caller: it becomes top-level in their tree", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, bodyDoc: linkingTo("child"), updatedAt: 1 },
        { id: "child", updatedAt: 1 },
        // Someone else's restricted page also links the child, but I can't see
        // it, so it is no parent in my tree.
        {
          id: "hidden-parent",
          createdById: SOMEONE,
          isInviteOnly: true,
          bodyDoc: linkingTo("child"),
          updatedAt: 1,
        },
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });
    expect((await caller.page.deleteImpact({ id: TARGET })).subpageCount).toBe(1);
  });

  it("does not count a sub-page the caller cannot view", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, bodyDoc: linkingTo("hidden-child", "visible-child"), updatedAt: 1 },
        { id: "hidden-child", createdById: SOMEONE, isInviteOnly: true, updatedAt: 1 },
        { id: "visible-child", updatedAt: 1 },
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });
    expect((await caller.page.deleteImpact({ id: TARGET })).subpageCount).toBe(1);
  });

  it("says the linker count is capped when the scan fills its window", async () => {
    install(
      db,
      buildWorkspace([
        { id: TARGET, updatedAt: 0 },
        ...Array.from({ length: 21 }, (_, i) => ({
          id: `linker-${i}`,
          bodyDoc: linkingTo(TARGET),
          updatedAt: i + 1,
        })),
      ]),
    );
    const caller = createMockCaller({ userId: ME, db });
    const impact = await caller.page.deleteImpact({ id: TARGET });
    // The 21st row only detects the overflow; it is not counted.
    expect(impact.linkedFromCount).toBe(20);
    expect(impact.linkedFromCapped).toBe(true);
  });

  it("needs edit access, like delete itself", async () => {
    install(
      db,
      buildWorkspace([{ id: TARGET, createdById: SOMEONE, updatedAt: 1 }]),
    );
    const viewer = createMockCaller({ userId: WS_VIEWER, db });
    const error = await viewer.page.deleteImpact({ id: TARGET }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("FORBIDDEN");
  });
});
