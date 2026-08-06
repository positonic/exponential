/**
 * bodyRepair — re-render page content for sync-created pages (ivory.pike).
 * Deep-mocked Prisma + a recording fake for the Notion block ops.
 *
 * This pass deletes Notion blocks, so most of what follows is about what it
 * must REFUSE to touch. The regression that motivated the guards: provenance
 * was inferred from the run ledger's `action: "created"`, which the inbound
 * engine also writes ("created a ticket from this page"), so human-authored
 * imported pages were wiped and replaced with a bare callout.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  isSyncAuthoredContent,
  rerenderCreatedPageBodies,
} from "../bodyRepair";
import { SYNC_CALLOUT_PREFIX } from "../outboundCreate";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const CONFIG = {
  id: "cfg1",
  integrationId: "int1",
  product: { slug: "prod", workspace: { slug: "ws" } },
};

type Block = Record<string, unknown>;

function calloutBlock(id = "callout-1"): Block {
  return {
    id,
    type: "callout",
    callout: {
      rich_text: [
        { plain_text: `${SYNC_CALLOUT_PREFIX} — edits here may be overwritten. ` },
        { plain_text: "Open ticket" },
      ],
    },
  };
}

function paragraphBlock(id: string, text = "some text"): Block {
  return { id, type: "paragraph", paragraph: { rich_text: [{ plain_text: text }] } };
}

interface FakeNotionOps {
  getPage(pageId: string): Promise<Record<string, unknown>>;
  listBlockChildren(blockId: string): Promise<Block[]>;
  deleteBlock(blockId: string): Promise<void>;
  appendBlockChildren(blockId: string, children: unknown[]): Promise<void>;
  deleted: string[];
  appended: Array<{ page: string; children: unknown[] }>;
}

/** Pages default to the shape the LEGACY creation path wrote: callout only. */
function fakeNotion(
  existingChildren: Record<string, Block[]> = {},
  opts: {
    failOn?: string;
    failAppend?: boolean;
    failDelete?: boolean;
    lastEditedBy?: Record<string, string>;
  } = {},
): FakeNotionOps {
  const deleted: string[] = [];
  const appended: Array<{ page: string; children: unknown[] }> = [];
  return {
    deleted,
    appended,
    getPage: (page) =>
      Promise.resolve(
        opts.lastEditedBy?.[page]
          ? { last_edited_by: { id: opts.lastEditedBy[page] } }
          : {},
      ),
    listBlockChildren: (page) => {
      if (opts.failOn === page) return Promise.reject(new Error("boom 403"));
      return Promise.resolve(
        existingChildren[page] ?? [calloutBlock(`${page}-callout`)],
      );
    },
    deleteBlock: (id) => {
      if (opts.failDelete) return Promise.reject(new Error("delete 500"));
      deleted.push(id);
      return Promise.resolve();
    },
    appendBlockChildren: (page, children) => {
      if (opts.failAppend) return Promise.reject(new Error("append 429"));
      appended.push({ page, children });
      return Promise.resolve();
    },
  };
}

function factoryFor(ops: FakeNotionOps, botId: string | null = null) {
  return () => Promise.resolve({ ok: true as const, notion: ops, botId });
}

function syncRow(externalId: string, body: string | null) {
  return {
    id: `s-${externalId}`,
    externalId,
    ticket: { id: `t-${externalId}`, title: `T ${externalId}`, body, number: 7 },
  };
}

/** The pass never writes unless the caller opts out of the dry-run default. */
function live(params: Record<string, unknown>) {
  return rerenderCreatedPageBodies(db, { dryRun: false, ...params } as never);
}

beforeEach(() => {
  mockReset(db);
  db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue(CONFIG as never);
});

describe("isSyncAuthoredContent", () => {
  it("accepts the exact shape the creation path writes", () => {
    expect(
      isSyncAuthoredContent([calloutBlock(), paragraphBlock("p1"), paragraphBlock("p2")]),
    ).toBe(true);
  });

  it("accepts an empty page — there is no content to lose", () => {
    expect(isSyncAuthoredContent([])).toBe(true);
  });

  it("rejects a page that does not open with the sync callout", () => {
    expect(isSyncAuthoredContent([paragraphBlock("p1")])).toBe(false);
    expect(
      isSyncAuthoredContent([
        { id: "c", type: "callout", callout: { rich_text: [{ plain_text: "Note" }] } },
      ]),
    ).toBe(false);
  });

  it("rejects human structure below the callout", () => {
    for (const type of ["heading_2", "to_do", "file", "child_database", "table"]) {
      expect(isSyncAuthoredContent([calloutBlock(), { id: "x", type }])).toBe(false);
    }
  });

  it("rejects nested content, which a wipe would orphan", () => {
    expect(
      isSyncAuthoredContent([
        calloutBlock(),
        { ...paragraphBlock("p1"), has_children: true },
      ]),
    ).toBe(false);
  });
});

describe("rerenderCreatedPageBodies", () => {
  it("wipes and re-renders push-created pages, with real blocks", async () => {
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-a", "## Heading\n\n**bold** text"),
    ] as never);
    const ops = fakeNotion({
      "page-a": [calloutBlock("old-1"), paragraphBlock("old-2")],
    });

    const result = await live({
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
  });

  it("selects candidates by remoteCreatedAt, never by the run ledger", async () => {
    db.ticketSync.findMany.mockResolvedValue([] as never);

    await live({ configId: "cfg1", deps: { notionFactory: factoryFor(fakeNotion()) } });

    // Provenance is the push-stamped column. The ledger's "created" action is
    // ambiguous across directions and must not be consulted at all.
    expect(db.ticketSync.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          configId: "cfg1",
          remoteCreatedAt: { not: null },
          tombstonedAt: null,
        }),
      }),
    );
    expect(db.ticketSyncRun.findMany).not.toHaveBeenCalled();
  });

  it("refuses to replace page content with a bare callout when the ticket has no body", async () => {
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-empty", null),
      syncRow("page-blank", "   \n  "),
    ] as never);
    const ops = fakeNotion();

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.repaired).toBe(0);
    expect(result.skipped).toBe(2);
    expect(ops.deleted).toEqual([]);
    expect(ops.appended).toEqual([]);
    expect(result.items[0]?.reason).toContain("no body");
  });

  it("leaves a page alone once a human has edited its content", async () => {
    // The incident shape: a page carrying headings, to-dos and an attachment.
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-human", "ticket body"),
    ] as never);
    const ops = fakeNotion({
      "page-human": [
        { id: "h1", type: "heading_1" },
        paragraphBlock("p1", "We don't have a structured approach…"),
        { id: "f1", type: "file" },
      ],
    });

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.repaired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(ops.deleted).toEqual([]);
    expect(ops.appended).toEqual([]);
    expect(result.items[0]?.reason).toContain("edited in Notion");
  });

  it("defaults to a dry run that deletes nothing and reads as a plan", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    const ops = fakeNotion({
      "page-a": [calloutBlock("old-1"), paragraphBlock("old-2")],
    });

    const result = await rerenderCreatedPageBodies(db, {
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.dryRun).toBe(true);
    expect(result.repaired).toBe(0);
    // Counted apart from `skipped` so the preview can be compared against the
    // live run's `repaired` — a guard refusal and a planned rewrite are not
    // the same outcome.
    expect(result.wouldRepair).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.items[0]?.outcome).toBe("would-repair");
    expect(ops.deleted).toEqual([]);
    expect(ops.appended).toEqual([]);
    expect(result.items[0]?.reason).toContain("would replace 2 block(s)");
  });

  it("skips a page Notion says a person edited last, whatever its blocks look like", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    // Blocks are the innocent legacy shape — only last_edited_by gives it away.
    const ops = fakeNotion(
      { "page-a": [calloutBlock("c1"), paragraphBlock("p1")] },
      { lastEditedBy: { "page-a": "human-user-id" } },
    );

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops, "bot-id") },
    });

    expect(result.repaired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(ops.deleted).toEqual([]);
    expect(ops.appended).toEqual([]);
    expect(result.items[0]?.reason).toContain("last edited by a person");
  });

  it("still repairs a page whose last editor is the sync bot", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    const ops = fakeNotion(
      { "page-a": [calloutBlock("c1"), paragraphBlock("p1")] },
      { lastEditedBy: { "page-a": "bot-id" } },
    );

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops, "bot-id") },
    });

    expect(result.repaired).toBe(1);
    expect(ops.appended).toHaveLength(1);
  });

  it("does not treat the current renderer's own output as a human edit", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    // Callout + heading + list is exactly what markdownToNotionBlocks emits.
    // It fails the shape check by design (the pass is one-shot), but saying a
    // human edited it would be a false claim about the customer's workspace.
    const ops = fakeNotion({
      "page-a": [
        calloutBlock("c1"),
        { id: "h1", type: "heading_2" },
        { id: "l1", type: "bulleted_list_item" },
      ],
    });

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.skipped).toBe(1);
    expect(result.items[0]?.reason).toBe(
      "already rendered as Notion blocks — nothing to repair",
    );
    expect(ops.deleted).toEqual([]);
  });

  it("appends before deleting, so a failed append leaves the old content intact", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    const ops = fakeNotion(
      { "page-a": [calloutBlock("old-1"), paragraphBlock("old-2")] },
      { failAppend: true },
    );

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.failed).toBe(1);
    // The page keeps its content. Delete-first would have emptied it.
    expect(ops.deleted).toEqual([]);
  });

  it("reports a page left holding both copies when the cleanup delete fails", async () => {
    db.ticketSync.findMany.mockResolvedValue([syncRow("page-a", "body")] as never);
    const ops = fakeNotion(
      { "page-a": [calloutBlock("old-1"), paragraphBlock("old-2")] },
      { failDelete: true },
    );

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.failed).toBe(1);
    expect(ops.appended).toHaveLength(1);
    expect(result.items[0]?.reason).toContain("needs manual cleanup");
  });

  it("continues past a failing page and reports it", async () => {
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-bad", "body"),
      syncRow("page-good", "body"),
    ] as never);
    const ops = fakeNotion({}, { failOn: "page-bad" });

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result.repaired).toBe(1);
    expect(result.failed).toBe(1);
    const failedItem = result.items.find((i) => i.outcome === "failed");
    expect(failedItem?.externalId).toBe("page-bad");
    expect(failedItem?.reason).toContain("boom");
  });

  it("is a no-op when no page was created by the push", async () => {
    db.ticketSync.findMany.mockResolvedValue([] as never);
    const ops = fakeNotion();

    const result = await live({
      configId: "cfg1",
      deps: { notionFactory: factoryFor(ops) },
    });

    expect(result).toEqual({
      ok: true,
      repaired: 0,
      wouldRepair: 0,
      skipped: 0,
      failed: 0,
      dryRun: false,
      items: [],
      nextCursor: null,
    });
  });

  it("paginates: returns a cursor when a full batch was processed, resumes after it", async () => {
    db.ticketSync.findMany.mockResolvedValue([
      syncRow("page-1", "b"),
      syncRow("page-2", "b"),
    ] as never);
    const ops = fakeNotion();

    const first = await live({
      configId: "cfg1",
      limit: 2,
      deps: { notionFactory: factoryFor(ops) },
    });
    // Full batch consumed -> a cursor pointing at the last processed sync.
    expect(first.repaired).toBe(2);
    expect(first.nextCursor).toBe("s-page-2");

    db.ticketSync.findMany.mockResolvedValue([syncRow("page-3", "b")] as never);
    const second = await live({
      configId: "cfg1",
      cursor: first.nextCursor!,
      limit: 2,
      deps: { notionFactory: factoryFor(ops) },
    });
    expect(second.repaired).toBe(1);
    // Short batch -> done.
    expect(second.nextCursor).toBeNull();
    // The resume cursor reached the query.
    expect(db.ticketSync.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { gt: "s-page-2" } }),
        take: 2,
      }),
    );
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
