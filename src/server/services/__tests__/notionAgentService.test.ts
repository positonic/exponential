/**
 * Unit tests for `notionAgentService` (ADR-0020 — Notion via authenticated callback).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real database is
 * ever touched (see CLAUDE.md "Test database safety"). The Notion client is
 * injected via the `makeNotionService` factory, so the logic is exercised with a
 * fake that returns canned hits — no network.
 *
 * Asserts external behaviour through the service interface: credential resolution
 * (workspace-scoped wins, personal fallback, not-connected) and the
 * `{connected}`-discriminated search shape.
 *
 * Prior art: `goalService.test.ts`, `access/__tests__/permissions.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `notionAgentService` transitively imports `~/server/db`, which runs T3 env
// validation at module load. Seed the minimum env BEFORE the import graph evaluates.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import { NotionAgentService } from "../notionAgentService";
import type { NotionService, NotionSearchHit } from "../NotionService";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

const db = mockDeep<PrismaClient>();

/** A row as returned by `integration.findFirst` with credentials included. */
function integrationRow(token: string, workspaceId: string | null) {
  return {
    id: `int-${workspaceId ?? "personal"}`,
    provider: "notion",
    userId: USER_ID,
    workspaceId,
    credentials: [
      // plaintext (isEncrypted:false) so getDecryptedKey returns it verbatim
      { key: token, keyType: "access_token", isEncrypted: false },
    ],
  };
}

/** Build a fake NotionService whose `search` returns the given hits. */
function fakeNotionService(hits: NotionSearchHit[], hasMore = false) {
  const search = vi.fn().mockResolvedValue({ results: hits, hasMore });
  return { search } as unknown as NotionService;
}

const HIT: NotionSearchHit = {
  id: "page-1",
  type: "page",
  title: "Payments 2026",
  url: "https://notion.so/page-1",
};

describe("NotionAgentService — credential resolution", () => {
  beforeEach(() => mockReset(db));

  it("uses the workspace-scoped integration when one matches", async () => {
    let capturedToken: string | undefined;
    db.integration.findFirst.mockImplementation((args: any) => {
      // workspace-scoped query
      if (args.where.workspaceId === WORKSPACE_ID) {
        return integrationRow("ws-token", WORKSPACE_ID) as any;
      }
      return integrationRow("personal-token", null) as any;
    });

    const svc = new NotionAgentService({
      db,
      makeNotionService: (token) => {
        capturedToken = token;
        return fakeNotionService([HIT]);
      },
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result.connected).toBe(true);
    expect(capturedToken).toBe("ws-token");
  });

  it("falls back to the personal (workspace-less) integration when no workspace row matches", async () => {
    let capturedToken: string | undefined;
    db.integration.findFirst.mockImplementation((args: any) => {
      if (args.where.workspaceId === WORKSPACE_ID) return null as any; // no workspace row
      if (args.where.workspaceId === null) {
        return integrationRow("personal-token", null) as any;
      }
      return null as any;
    });

    const svc = new NotionAgentService({
      db,
      makeNotionService: (token) => {
        capturedToken = token;
        return fakeNotionService([HIT]);
      },
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result.connected).toBe(true);
    expect(capturedToken).toBe("personal-token");
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT]),
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result).toEqual({ connected: false });
  });

  it("returns {connected:false} when the integration has no usable token credential", async () => {
    db.integration.findFirst.mockResolvedValue({
      id: "int-1",
      provider: "notion",
      userId: USER_ID,
      workspaceId: null,
      credentials: [{ key: "{}", keyType: "notion_metadata", isEncrypted: false }],
    } as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT]),
    });

    expect(await svc.resolveService(USER_ID, null)).toEqual({ connected: false });
  });
});

describe("NotionAgentService — search", () => {
  beforeEach(() => mockReset(db));

  it("returns {connected:true, total>0} with the lean hits when there are matches", async () => {
    db.integration.findFirst.mockResolvedValue(
      integrationRow("personal-token", null) as any,
    );

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT], true),
    });

    const result = await svc.search(USER_ID, null, "payments");
    expect(result).toEqual({
      connected: true,
      total: 1,
      results: [HIT],
      hasMore: true,
    });
  });

  it("returns {connected:true, total:0} when the integration is present but matches nothing", async () => {
    db.integration.findFirst.mockResolvedValue(
      integrationRow("personal-token", null) as any,
    );

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([]),
    });

    const result = await svc.search(USER_ID, WORKSPACE_ID, "nothing-here");
    expect(result).toEqual({
      connected: true,
      total: 0,
      results: [],
      hasMore: false,
    });
  });

  it("returns {connected:false} (no search attempted) when Notion is not connected", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);
    const search = vi.fn();

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => ({ search } as unknown as NotionService),
    });

    expect(await svc.search(USER_ID, null, "anything")).toEqual({
      connected: false,
    });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("NotionAgentService — queryDatabase", () => {
  beforeEach(() => mockReset(db));

  /** Build a fake NotionService whose `queryDatabase` returns the given raw pages. */
  function fakeQueryService(
    page: { results: any[]; hasMore?: boolean; nextCursor?: string | null },
    spy?: ReturnType<typeof vi.fn>,
  ) {
    const queryDatabase = (spy ?? vi.fn()).mockResolvedValue({
      results: page.results,
      hasMore: page.hasMore ?? false,
      nextCursor: page.nextCursor ?? null,
    });
    return { queryDatabase } as unknown as NotionService;
  }

  /** A raw Notion page with a title, a scalar prop, and a rich-text blob. */
  function rawPage(id: string) {
    return {
      id,
      url: `https://notion.so/${id}`,
      properties: {
        Name: { type: "title", title: [{ plain_text: `Row ${id}` }] },
        Amount: { type: "number", number: 1200 },
        Status: { type: "select", select: { name: "Due" } },
        Notes: { type: "rich_text", rich_text: [{ plain_text: "a very long blob".repeat(50) }] },
      },
    };
  }

  it("requests a 25-row page (the cap) and reports total = rows returned", async () => {
    db.integration.findFirst.mockResolvedValue(integrationRow("t", null) as any);
    const spy = vi.fn();
    const pages = Array.from({ length: 25 }, (_, i) => rawPage(`p${i}`));

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeQueryService({ results: pages, hasMore: true, nextCursor: "cur" }, spy),
    });

    const result = await svc.queryDatabase(USER_ID, null, "db-1");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 25, databaseId: "db-1" }));
    expect(result).toMatchObject({ connected: true, total: 25, hasMore: true, nextCursor: "cur" });
  });

  it("projects scalar properties only — title surfaced separately, rich-text blob dropped", async () => {
    db.integration.findFirst.mockResolvedValue(integrationRow("t", null) as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeQueryService({ results: [rawPage("p1")] }),
    });

    const result = await svc.queryDatabase(USER_ID, null, "db-1");
    if (!result.connected) throw new Error("expected connected");
    const row = result.rows[0]!;
    expect(row.title).toBe("Row p1");
    expect(row.props).toEqual({ Amount: 1200, Status: "Due" }); // no Name (title), no Notes (rich_text)
    expect(row.props).not.toHaveProperty("Notes");
    expect(row.props).not.toHaveProperty("Name");
  });

  it("returns {connected:true, total:0} when the database has zero matching rows", async () => {
    db.integration.findFirst.mockResolvedValue(integrationRow("t", null) as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeQueryService({ results: [] }),
    });

    expect(await svc.queryDatabase(USER_ID, null, "db-1")).toEqual({
      connected: true,
      total: 0,
      hasMore: false,
      nextCursor: null,
      rows: [],
    });
  });

  it("returns {connected:false} (no query attempted) when Notion is not connected", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);
    const queryDatabase = vi.fn();

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => ({ queryDatabase } as unknown as NotionService),
    });

    expect(await svc.queryDatabase(USER_ID, null, "db-1")).toEqual({ connected: false });
    expect(queryDatabase).not.toHaveBeenCalled();
  });
});

describe("NotionAgentService — getPage", () => {
  beforeEach(() => mockReset(db));

  /** Fake NotionService.getPageWithBlocks returning a page + paragraph blocks. */
  function fakePageService(page: any, blocks: any[]) {
    const getPageWithBlocks = vi.fn().mockResolvedValue({ page, blocks });
    return { getPageWithBlocks } as unknown as NotionService;
  }

  function paragraph(text: string) {
    return { type: "paragraph", paragraph: { rich_text: [{ plain_text: text }] } };
  }

  const PAGE = {
    id: "pg-1",
    url: "https://notion.so/pg-1",
    properties: { Name: { type: "title", title: [{ plain_text: "Meeting notes" }] } },
  };

  it("returns title + flattened block text, untruncated for short pages", async () => {
    db.integration.findFirst.mockResolvedValue(integrationRow("t", null) as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakePageService(PAGE, [paragraph("line one"), paragraph("line two")]),
    });

    const result = await svc.getPage(USER_ID, null, "pg-1");
    expect(result).toEqual({
      connected: true,
      id: "pg-1",
      title: "Meeting notes",
      url: "https://notion.so/pg-1",
      text: "line one\nline two",
      truncated: false,
    });
  });

  it("truncates long content to ~3k chars and sets truncated:true", async () => {
    db.integration.findFirst.mockResolvedValue(integrationRow("t", null) as any);
    const longBlock = paragraph("x".repeat(5000));

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakePageService(PAGE, [longBlock]),
    });

    const result = await svc.getPage(USER_ID, null, "pg-1");
    if (!result.connected) throw new Error("expected connected");
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(3000);
  });

  it("returns {connected:false} (no fetch attempted) when Notion is not connected", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);
    const getPageWithBlocks = vi.fn();

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => ({ getPageWithBlocks } as unknown as NotionService),
    });

    expect(await svc.getPage(USER_ID, null, "pg-1")).toEqual({ connected: false });
    expect(getPageWithBlocks).not.toHaveBeenCalled();
  });
});
