/**
 * Unit tests for the Page embedding trigger (ADR-0033). We mock KnowledgeService
 * so no DB / OpenAI is touched, and assert the embed-vs-clear decision, that the
 * work is handed to `after()` (so the platform keeps it alive), the DB-backed
 * settle that coalesces rapid saves, and the cron backstop sweep.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const embedSource = vi.fn();
const deleteChunks = vi.fn();

vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ embedSource, deleteChunks }),
}));

vi.mock("~/server/utils/reportHandledErrorServer", () => ({
  reportHandledErrorServer: vi.fn(),
}));

// Capture after() tasks so each test can await the background work.
const afterTasks: Promise<unknown>[] = [];
const after = vi.fn((task: () => Promise<unknown>) => {
  afterTasks.push(task());
});
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => after(task) }));

import { EmbeddingTriggerService } from "../EmbeddingTriggerService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

interface FakePage {
  id: string;
  includeInSearch: boolean;
  body: string | null;
  workspaceId?: string;
  projectId?: string | null;
  createdById?: string;
}

/**
 * A fake DB whose pages can be edited between trigger and settle. `extra`
 * adds models the projection reads (ADR-0078); an `extra.$queryRaw` answers
 * every raw query except the settle fingerprint.
 */
function makeService(
  initial: Record<string, FakePage | null>,
  extra: Record<string, unknown> = {},
) {
  const pages = { ...initial };
  // The settle fingerprint query is answered from `pages` (plain body stands
  // in for the DB-side md5); anything else (the sweep) is scripted per test.
  const sweepRows =
    (extra.$queryRaw as ReturnType<typeof vi.fn> | undefined) ?? vi.fn().mockResolvedValue([]);
  const queryRaw = vi.fn((strings: readonly string[], ...values: unknown[]) => {
    // Tagged-template calls pass the strings array; the projection passes a
    // prebuilt Prisma.sql object.
    const sql = Array.isArray(strings) ? strings.join("?") : "";
    if (!sql.includes("md5(")) return sweepRows(strings, ...values);
    const page = pages[values[0] as string];
    return Promise.resolve(
      page ? [{ key: `${page.includeInSearch}|${page.projectId ?? ""}|${page.body ?? ""}` }] : [],
    );
  });
  const db = {
    knowledgePage: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(pages[where.id] ? { ...pages[where.id] } : null),
      ),
    },
    ...extra,
    $queryRaw: queryRaw,
  } as unknown as ConstructorParameters<typeof EmbeddingTriggerService>[0];
  return { svc: new EmbeddingTriggerService(db), pages, sweepRows };
}

const fullPage: FakePage = {
  id: "p1",
  includeInSearch: true,
  body: "hello world",
  workspaceId: "w1",
  projectId: null,
  createdById: "u1",
};

async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.all(afterTasks);
}

describe("EmbeddingTriggerService — pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterTasks.length = 0;
    embedSource.mockResolvedValue({ success: true, chunkCount: 2 });
    deleteChunks.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands the work to after() and embeds a searchable page after the settle delay", async () => {
    const { svc } = makeService({ p1: fullPage });
    svc.triggerPageEmbedding("p1", 100);
    expect(after).toHaveBeenCalledTimes(1);
    expect(embedSource).not.toHaveBeenCalled(); // not yet — settling
    await settle(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
    expect(deleteChunks).not.toHaveBeenCalled();
  });

  it("clears chunks when includeInSearch is off", async () => {
    const { svc } = makeService({ p1: { ...fullPage, includeInSearch: false } });
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("clears chunks when the page is gone", async () => {
    const { svc } = makeService({ p1: null });
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("clears chunks for an empty body", async () => {
    const { svc } = makeService({ p1: { ...fullPage, body: "   " } });
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("coalesces rapid saves: earlier triggers stand down once the body moves on", async () => {
    const { svc, pages } = makeService({ p1: fullPage });
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(10);
    pages.p1 = { ...fullPage, body: "hello world, edited" };
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(10);
    pages.p1 = { ...fullPage, body: "hello world, edited twice" };
    svc.triggerPageEmbedding("p1", 100);
    await settle(200);
    expect(embedSource).toHaveBeenCalledTimes(1);
  });

  it("embeds a database block as its projected table, not the stored marker (ADR-0078)", async () => {
    const TITLE = "ptitle000001";
    const { svc } = makeService(
      { p1: { ...fullPage, body: "# Page\n\n<!-- database:db1 -->" } },
      {
        pageDatabase: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "db1",
              name: "Metrics",
              properties: [{ id: TITLE, name: "Name", type: "title" }],
              view: { filters: [], hiddenPropertyIds: [], propertyOrder: [] },
              titlePropertyId: TITLE,
              workspace: { slug: "acme" },
            },
          ]),
        },
        $queryRaw: vi.fn().mockResolvedValue([
          { id: "r1", title: "Alert latency", properties: {}, databaseId: "db1", createdById: "u1", createdAt: new Date(), updatedAt: new Date() },
        ]),
        user: { findMany: vi.fn().mockResolvedValue([]) },
      },
    );
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
    const source = embedSource.mock.calls[0]![0] as { getContent(): string | null };
    expect(source.getContent()).toContain("| Name |");
    expect(source.getContent()).toContain("[Alert latency](/w/acme/pages/r1)");
  });

  it("embeds a row that has values but no prose as its property header (ADR-0078)", async () => {
    const STATUS = "pstatus00001";
    const { svc } = makeService(
      { p1: { ...fullPage, body: null, databaseId: "db1", properties: { [STATUS]: "Tracked" } } as never },
      {
        pageDatabase: {
          findUnique: vi.fn().mockResolvedValue({
            id: "db1",
            name: "Metrics",
            pageId: "holder",
            properties: [
              { id: "ptitle000001", name: "Name", type: "title" },
              { id: STATUS, name: "Status", type: "text" },
            ],
            view: { filters: [], hiddenPropertyIds: [], propertyOrder: [] },
            page: { title: "Holder" },
            workspace: { slug: "acme" },
          }),
        },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      },
    );
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(deleteChunks).not.toHaveBeenCalled();
    const source = embedSource.mock.calls[0]![0] as { getContent(): string | null };
    expect(source.getContent()).toBe("**Status:** Tracked");
  });

  it("still embeds when only non-indexed fields changed during the settle (e.g. a comment anchor)", async () => {
    const { svc, pages } = makeService({ p1: fullPage });
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(10);
    pages.p1 = { ...fullPage, workspaceId: "w1" }; // same body / inclusion / project
    await settle(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
  });

  it("reports a failed embed instead of swallowing it", async () => {
    embedSource.mockResolvedValueOnce({ success: false, chunkCount: 0, error: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { svc } = makeService({ p1: fullPage });
    svc.triggerPageEmbedding("p1", 100);
    await settle(100);
    expect(reportHandledErrorServer).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: "embedding.page", context: { pageId: "p1" } }),
    );
  });

  it("runs detached when called outside a request scope (after() throws)", async () => {
    after.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const { svc } = makeService({ p1: fullPage });
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(embedSource).toHaveBeenCalledTimes(1));
  });

  it("clearPageChunks deletes immediately", async () => {
    const { svc } = makeService({ p1: fullPage });
    await svc.clearPageChunks("p1");
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
  });
});

describe("EmbeddingTriggerService — reindexStalePages (cron backstop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedSource.mockResolvedValue({ success: true, chunkCount: 2 });
    deleteChunks.mockResolvedValue(undefined);
  });

  it("re-embeds stale searchable pages and clears opted-out or emptied ones", async () => {
    const { svc, sweepRows } = makeService({
      p1: fullPage,
      p2: { ...fullPage, id: "p2", includeInSearch: false },
      p4: { ...fullPage, id: "p4", body: "" },
    });
    sweepRows.mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }, { id: "p4" }]);

    const result = await svc.reindexStalePages(new Date("2026-10-08T12:00:00Z"), 20);

    expect(result).toEqual({ checked: 3, embedded: 1, cleared: 2, failed: 0, skipped: 0 });
    expect(embedSource).toHaveBeenCalledTimes(1);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p2");
    expect(deleteChunks).toHaveBeenCalledWith("page", "p4");
  });

  it("bounds re-embeds to the lookback window but clears unwanted chunks at any age", async () => {
    const { svc, sweepRows } = makeService({});
    const now = new Date("2026-10-08T12:00:00Z");
    await svc.reindexStalePages(now, 20);

    const [strings, ...values] = sweepRows.mock.calls[0] as [readonly string[], ...unknown[]];
    const sql = strings.join("?");
    expect(values).toEqual([
      new Date("2026-10-08T11:58:00Z"), // still-settling saves are left to their trigger
      new Date("2026-10-07T12:00:00Z"), // 24h lookback, re-embed branch only
      20,
    ]);
    // The lookback sits inside the re-embed branch, not on the whole query, so
    // an emptied or opted-out page's stale chunks are cleared however old.
    const [reembed, clear] = sql.split(/\)\s+OR\s+\(/);
    expect(reembed).toContain('p."updatedAt" > ?');
    expect(reembed).toContain("<> ''");
    expect(clear).not.toContain('p."updatedAt" > ?');
    expect(clear).toContain('NOT p."includeInSearch" OR btrim(coalesce(p.body, \'\')) = \'\'');
  });

  it("counts a failure and keeps going", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    embedSource
      .mockResolvedValueOnce({ success: false, chunkCount: 0, error: "boom" })
      .mockResolvedValueOnce({ success: true, chunkCount: 1 });
    const { svc, sweepRows } = makeService({ p1: fullPage, p3: { ...fullPage, id: "p3" } });
    sweepRows.mockResolvedValueOnce([{ id: "p1" }, { id: "p3" }]);

    const result = await svc.reindexStalePages();

    expect(result).toEqual({ checked: 2, embedded: 1, cleared: 0, failed: 1, skipped: 0 });
  });
});
