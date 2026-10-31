/**
 * Unit tests for the Page embedding trigger (ADR-0033). We mock KnowledgeService
 * so no DB / OpenAI is touched, and assert the embed-vs-clear decision and the
 * per-page debounce.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const embedSource = vi.fn().mockResolvedValue({ success: true, chunkCount: 2 });
const deleteChunks = vi.fn().mockResolvedValue(undefined);

vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ embedSource, deleteChunks }),
}));

import { EmbeddingTriggerService } from "../EmbeddingTriggerService";

type FakePage = {
  id: string;
  includeInSearch: boolean;
  body: string | null;
  workspaceId?: string;
  projectId?: string | null;
  createdById?: string;
} | null;

function makeService(page: FakePage, extra: Record<string, unknown> = {}) {
  const db = {
    knowledgePage: { findUnique: vi.fn().mockResolvedValue(page) },
    ...extra,
  } as unknown as ConstructorParameters<typeof EmbeddingTriggerService>[0];
  return new EmbeddingTriggerService(db);
}

const fullPage = {
  id: "p1",
  includeInSearch: true,
  body: "hello world",
  workspaceId: "w1",
  projectId: null,
  createdById: "u1",
};

describe("EmbeddingTriggerService — pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("embeds a searchable page with body after the settle delay", async () => {
    const svc = makeService(fullPage);
    svc.triggerPageEmbedding("p1", 100);
    expect(embedSource).not.toHaveBeenCalled(); // not yet — debounced
    await vi.advanceTimersByTimeAsync(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
    expect(deleteChunks).not.toHaveBeenCalled();
  });

  it("clears chunks when includeInSearch is off", async () => {
    const svc = makeService({ ...fullPage, includeInSearch: false });
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("clears chunks when the page is gone", async () => {
    const svc = makeService(null);
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("clears chunks for an empty body", async () => {
    const svc = makeService({ ...fullPage, body: "   " });
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    expect(embedSource).not.toHaveBeenCalled();
  });

  it("debounces rapid triggers into a single embed", async () => {
    const svc = makeService(fullPage);
    svc.triggerPageEmbedding("p1", 100);
    svc.triggerPageEmbedding("p1", 100);
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
  });

  it("embeds a database block as its projected table, not the stored marker (ADR-0078)", async () => {
    const TITLE = "ptitle000001";
    const svc = makeService(
      { ...fullPage, body: "# Page\n\n<!-- database:db1 -->" },
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
    await vi.advanceTimersByTimeAsync(100);
    expect(embedSource).toHaveBeenCalledTimes(1);
    const source = embedSource.mock.calls[0]![0] as { getContent(): string | null };
    expect(source.getContent()).toContain("| Name |");
    expect(source.getContent()).toContain("[Alert latency](/w/acme/pages/r1)");
  });

  it("embeds a row that has values but no prose as its property header (ADR-0078)", async () => {
    const STATUS = "pstatus00001";
    const svc = makeService(
      { ...fullPage, body: null, databaseId: "db1", properties: { [STATUS]: "Tracked" } } as never,
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
          }),
        },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      },
    );
    svc.triggerPageEmbedding("p1", 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(deleteChunks).not.toHaveBeenCalled();
    const source = embedSource.mock.calls[0]![0] as { getContent(): string | null };
    expect(source.getContent()).toBe("**Status:** Tracked");
  });

  it("clearPageChunks deletes immediately and cancels a pending embed", async () => {
    const svc = makeService(fullPage);
    svc.triggerPageEmbedding("p1", 100);
    await svc.clearPageChunks("p1");
    expect(deleteChunks).toHaveBeenCalledWith("page", "p1");
    await vi.advanceTimersByTimeAsync(500);
    expect(embedSource).not.toHaveBeenCalled();
  });
});
