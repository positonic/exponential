/**
 * bodyRepair — re-render page content for sync-created pages (ivory.pike).
 * Deep-mocked Prisma + a recording fake for the Notion block ops.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { rerenderCreatedPageBodies } from "../bodyRepair";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const CONFIG = {
  id: "cfg1",
  integrationId: "int1",
  product: { slug: "prod", workspace: { slug: "ws" } },
};

interface FakeNotionOps {
  listBlockChildrenIds(blockId: string): Promise<string[]>;
  deleteBlock(blockId: string): Promise<void>;
  appendBlockChildren(blockId: string, children: unknown[]): Promise<void>;
  deleted: string[];
  appended: Array<{ page: string; children: unknown[] }>;
}

function fakeNotion(
  existingChildren: Record<string, string[]> = {},
  opts: { failOn?: string } = {},
): FakeNotionOps {
  const deleted: string[] = [];
  const appended: Array<{ page: string; children: unknown[] }> = [];
  return {
    deleted,
    appended,
    listBlockChildrenIds: (page) => {
      if (opts.failOn === page) return Promise.reject(new Error("boom 403"));
      return Promise.resolve(existingChildren[page] ?? []);
    },
    deleteBlock: (id) => {
      deleted.push(id);
      return Promise.resolve();
    },
    appendBlockChildren: (page, children) => {
      appended.push({ page, children });
      return Promise.resolve();
    },
  };
}

function factoryFor(ops: FakeNotionOps) {
  return () => Promise.resolve({ ok: true as const, notion: ops, botId: null });
}

function ledgerRun(items: unknown[]): { items: unknown } {
  return { items };
}

function syncRow(externalId: string, body: string | null) {
  return {
    id: `s-${externalId}`,
    externalId,
    ticket: { id: `t-${externalId}`, title: `T ${externalId}`, body, number: 7 },
  };
}

beforeEach(() => {
  mockReset(db);
  db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue(CONFIG as never);
});

describe("rerenderCreatedPageBodies", () => {
  it("wipes and re-renders only ledger-created pages, with real blocks", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([
      ledgerRun([
        { action: "created", externalId: "page-a" },
        { action: "pushed", externalId: "page-imported" },
      ]),
    ] as never);
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-a", "## Heading\n\n**bold** text"),
    ] as never);
    const ops = fakeNotion({ "page-a": ["old-1", "old-2"] });

    const result = await rerenderCreatedPageBodies(db, {
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(1);
    expect(ops.deleted).toEqual(["old-1", "old-2"]);
    expect(ops.appended).toHaveLength(1);
    const children = ops.appended[0]!.children as Array<{ type: string }>;
    // Callout backlink first, then a real heading — not a literal "## " paragraph.
    expect(children[0]!.type).toBe("callout");
    expect(children[1]!.type).toBe("heading_2");
    // The created-page filter reached the query: only ledger-created ids.
    expect(db.ticketSync.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalId: { in: ["page-a"] },
        }),
      }),
    );
  });

  it("continues past a failing page and reports it", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([
      ledgerRun([
        { action: "created", externalId: "page-bad" },
        { action: "created", externalId: "page-good" },
      ]),
    ] as never);
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-bad", "body"),
      syncRow("page-good", "body"),
    ] as never);
    const ops = fakeNotion({}, { failOn: "page-bad" });

    const result = await rerenderCreatedPageBodies(db, {
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.repaired).toBe(1);
    expect(result.failed).toBe(1);
    const failedItem = result.items.find((i) => i.outcome === "failed");
    expect(failedItem?.externalId).toBe("page-bad");
    expect(failedItem?.reason).toContain("boom");
  });

  it("is a no-op when the ledger records no created pages", async () => {
    db.ticketSyncRun.findMany.mockResolvedValue([
      ledgerRun([{ action: "updated", externalId: "page-x" }]),
    ] as never);
    const ops = fakeNotion();

    const result = await rerenderCreatedPageBodies(db, {
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result).toEqual({ ok: true, repaired: 0, failed: 0, items: [] });
    expect(db.ticketSync.findMany).not.toHaveBeenCalled();
  });

  it("refuses a disconnected config", async () => {
    db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue({
      ...CONFIG,
      integrationId: null,
    } as never);

    const result = await rerenderCreatedPageBodies(db, { configId: "cfg1" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("disconnected");
  });
});
