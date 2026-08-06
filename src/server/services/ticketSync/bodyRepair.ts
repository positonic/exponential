import type { PrismaClient } from "@prisma/client";
import { buildBodyBlocks, SYNC_CALLOUT_PREFIX } from "./outboundCreate";
import { resolveNotionServiceForIntegration } from "./notionAdapter";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * ticketSync/bodyRepair — re-render the page CONTENT of pages the outbound
 * sync itself created (ivory.pike).
 *
 * Page bodies are written once at creation; pages created before the
 * Markdown→blocks renderer landed carry their ticket body as literal Markdown
 * text. This maintenance pass rebuilds those pages' content in place.
 *
 * This deletes Notion content, so it is guarded five times over. An earlier
 * version inferred provenance from the run ledger's `action: "created"` — a
 * token the INBOUND engine also writes, meaning "created a ticket from this
 * page". Every page ever imported from Notion was therefore classified as
 * machine-authored and had its human content deleted. The guards below are
 * layered so that no single wrong assumption can repeat that:
 *
 *  1. PROVENANCE — only syncs with `remoteCreatedAt` set (stamped by push.ts
 *     at the moment it created the page). The ledger is never consulted.
 *  2. NON-EMPTY BODY — never replace page content with a bare callout. If the
 *     ticket has no body there is nothing to restore, so deleting is pure loss.
 *  3. LAST EDITOR — Notion's own answer to "has a person touched this?". A page
 *     whose `last_edited_by` is not our bot is skipped whatever its blocks look
 *     like, which catches the human edit that a shape check cannot see.
 *  4. SHAPE — the content must still match the LEGACY creation path (sync
 *     callout + flat paragraphs), which is the population this sweep exists to
 *     repair. Anything else is either a human edit or a page the current
 *     renderer already wrote correctly.
 *  5. DRY RUN — the caller must opt in to writing; a bare call only reports.
 *
 * A page failing any guard is reported without being touched. Writes are
 * ordered append-then-delete, so an interrupted repair leaves duplicated
 * content (visible, recoverable) rather than an empty page.
 */

export interface BodyRepairItem {
  syncId: string;
  externalId: string;
  ticketId: string;
  title: string;
  outcome: "repaired" | "would-repair" | "skipped" | "failed";
  reason?: string;
}

export interface BodyRepairResult {
  ok: boolean;
  error?: string;
  repaired: number;
  /**
   * Pages a dry run WOULD repair. Counted separately from `skipped` so a
   * preview reads as a plan: `wouldRepair` on a dry run should equal
   * `repaired` on the live run that follows it.
   */
  wouldRepair: number;
  /** Pages a guard held back — reported, never written to. */
  skipped: number;
  failed: number;
  dryRun: boolean;
  items: BodyRepairItem[];
  /**
   * Continuation cursor (last processed sync id) when more created pages
   * remain; null when the sweep is complete. A page repair costs ~10-30
   * Notion API calls, so a full product cannot fit in one serverless
   * request — callers loop with the cursor.
   */
  nextCursor: string | null;
}

/** Pages per invocation — small enough to finish inside a function timeout. */
const DEFAULT_BATCH_SIZE = 3;

type NotionBlock = Record<string, unknown>;

interface NotionBlockOps {
  getPage(pageId: string): Promise<Record<string, unknown>>;
  listBlockChildren(blockId: string): Promise<NotionBlock[]>;
  deleteBlock(blockId: string): Promise<void>;
  appendBlockChildren(blockId: string, children: unknown[]): Promise<void>;
}

type NotionFactory = (
  db: PrismaClient,
  integrationId: string,
) => Promise<
  | { ok: true; notion: NotionBlockOps; botId: string | null }
  | { ok: false; error: string }
>;

function richTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((run) => {
      if (!run || typeof run !== "object") return "";
      const r = run as Record<string, unknown>;
      if (typeof r.plain_text === "string") return r.plain_text;
      const text = r.text as Record<string, unknown> | undefined;
      return typeof text?.content === "string" ? text.content : "";
    })
    .join("");
}

/** Does the page open with the callout every sync-created page leads with? */
export function leadsWithSyncCallout(blocks: NotionBlock[]): boolean {
  const first = blocks[0];
  if (!first || first.type !== "callout") return false;
  const callout = first.callout as Record<string, unknown> | undefined;
  return richTextToPlain(callout?.rich_text).startsWith(SYNC_CALLOUT_PREFIX);
}

/**
 * Does this page's content still look like something the LEGACY creation path
 * wrote — the population this sweep exists to repair?
 *
 * That path emitted exactly: the sync callout, then flat paragraph blocks,
 * nothing nested. The CURRENT path renders real Markdown via
 * markdownToNotionBlocks — headings, code, lists, quotes, dividers — so a page
 * written by today's renderer deliberately does NOT match. That makes the pass
 * one-shot by design: once repaired, a page is never a candidate again.
 *
 * The tightness is the point, and it must stay. Loosening this to admit
 * headings and lists would re-admit human-authored pages and reopen the
 * incident window — a human page with headings would then pass.
 *
 * An empty page passes: there is no content to lose.
 */
export function isSyncAuthoredContent(blocks: NotionBlock[]): boolean {
  if (blocks.length === 0) return true;
  if (!leadsWithSyncCallout(blocks)) return false;

  // Nested content is never something the legacy path wrote — a child block
  // would be silently orphaned by the delete, so its presence disqualifies.
  if (blocks.some((block) => block.has_children === true)) return false;

  return blocks.slice(1).every((block) => block.type === "paragraph");
}

export async function rerenderCreatedPageBodies(
  db: PrismaClient,
  params: {
    configId: string;
    /** Resume after this sync id (the previous call's nextCursor). */
    cursor?: string;
    /** Pages this invocation may repair (keep small: serverless timeout). */
    limit?: number;
    /** Must be explicitly false to write. Defaults to a no-write preview. */
    dryRun?: boolean;
    deps?: { notionFactory?: NotionFactory };
  },
): Promise<BodyRepairResult> {
  const notionFactory =
    params.deps?.notionFactory ??
    (resolveNotionServiceForIntegration as unknown as NotionFactory);

  // Guard 5: writing is opt-in. A caller that forgets the flag gets a report.
  const dryRun = params.dryRun !== false;

  const config = await db.ticketSyncConfig.findUniqueOrThrow({
    where: { id: params.configId },
    include: {
      product: {
        select: { slug: true, workspace: { select: { slug: true } } },
      },
    },
  });

  if (!config.integrationId) {
    return {
      ok: false,
      error: "Notion sync is disconnected for this product",
      repaired: 0,
      wouldRepair: 0,
      skipped: 0,
      failed: 0,
      dryRun,
      items: [],
      nextCursor: null,
    };
  }

  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_BATCH_SIZE, 10));

  const resolved = await notionFactory(db, config.integrationId);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      repaired: 0,
      wouldRepair: 0,
      skipped: 0,
      failed: 0,
      dryRun,
      items: [],
      nextCursor: null,
    };
  }
  const notion = resolved.notion;
  // Notion's own edit attribution. Null when the integration never recorded a
  // bot id — then guard 3 cannot answer and falls through to the shape check,
  // never the other way round.
  const botId = resolved.botId;

  // Guard 1: provenance comes from the column push.ts stamps when it creates
  // the page — never from the run ledger, whose "created" action is ambiguous
  // across sync directions.
  const syncs = await db.ticketSync.findMany({
    where: {
      configId: config.id,
      remoteCreatedAt: { not: null },
      tombstonedAt: null,
      ...(params.cursor ? { id: { gt: params.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      externalId: true,
      ticket: {
        select: { id: true, title: true, body: true, number: true },
      },
    },
    take: limit,
  });

  const base = getPublicBaseUrlFromEnv();
  const workspaceSlug = config.product.workspace.slug;
  const productSlug = config.product.slug;

  const items: BodyRepairItem[] = [];
  let repaired = 0;
  let wouldRepair = 0;
  let skipped = 0;
  let failed = 0;

  for (const sync of syncs) {
    const backlinkUrl = `${base}/w/${workspaceSlug}/products/${productSlug}/tickets/${sync.ticket.number}`;
    const itemBase = {
      syncId: sync.id,
      externalId: sync.externalId,
      ticketId: sync.ticket.id,
      title: sync.ticket.title,
    };

    // Guard 2: a bare callout is not a repair, it is a deletion.
    if (!sync.ticket.body?.trim()) {
      skipped++;
      items.push({
        ...itemBase,
        outcome: "skipped",
        reason:
          "ticket has no body — refusing to replace the page content with an empty one",
      });
      continue;
    }

    try {
      // Guard 3: ask Notion who touched this last. Mirrors the echo-suppression
      // comparison in notionAdapter. A page edited by a person is off limits
      // however innocent its blocks look — this is the one signal that catches
      // a human appending plain paragraphs to a page we created.
      const page = await notion.getPage(sync.externalId);
      const lastEditor = (page as { last_edited_by?: { id?: string } })
        .last_edited_by?.id;
      if (botId && lastEditor && lastEditor !== botId) {
        skipped++;
        items.push({
          ...itemBase,
          outcome: "skipped",
          reason: "page was last edited by a person, not the sync bot",
        });
        continue;
      }

      const existing = await notion.listBlockChildren(sync.externalId);

      // Guard 4: the content must still be the legacy render. Two very
      // different situations land here, and an operator needs to tell them
      // apart — "someone edited this" is a claim about a customer's workspace
      // and must not be made about a page we ourselves rendered correctly.
      if (!isSyncAuthoredContent(existing)) {
        skipped++;
        items.push({
          ...itemBase,
          outcome: "skipped",
          reason: leadsWithSyncCallout(existing)
            ? "already rendered as Notion blocks — nothing to repair"
            : "page content has been edited in Notion — left untouched to avoid deleting human work",
        });
        continue;
      }

      if (dryRun) {
        wouldRepair++;
        items.push({
          ...itemBase,
          outcome: "would-repair",
          reason: `would replace ${existing.length} block(s) with the re-rendered body`,
        });
        continue;
      }

      const blocks = buildBodyBlocks(sync.ticket.body, backlinkUrl);
      // Append BEFORE deleting. The block ids were captured above, so the new
      // blocks are never in the delete set. A failure part-way then leaves the
      // page holding both copies — visible and recoverable — where delete-first
      // would leave it empty. A long body is two append calls (MAX_BLOCKS 90 +
      // the callout, chunked at 90), so a partial write is reachable.
      await notion.appendBlockChildren(sync.externalId, blocks);
      try {
        for (const block of existing) {
          const blockId = typeof block.id === "string" ? block.id : null;
          if (blockId) await notion.deleteBlock(blockId);
        }
      } catch (error) {
        throw new Error(
          `new content was appended but the old content could not be removed — the page now holds both and needs manual cleanup: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
      repaired++;
      items.push({ ...itemBase, outcome: "repaired" });
    } catch (error) {
      failed++;
      items.push({
        ...itemBase,
        outcome: "failed",
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  const nextCursor =
    syncs.length === limit ? (syncs[syncs.length - 1]?.id ?? null) : null;
  return {
    ok: true,
    repaired,
    wouldRepair,
    skipped,
    failed,
    dryRun,
    items,
    nextCursor,
  };
}
