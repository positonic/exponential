import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { buildBodyBlocks } from "./outboundCreate";
import { resolveNotionServiceForIntegration } from "./notionAdapter";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * ticketSync/bodyRepair — re-render the page CONTENT of pages the outbound
 * sync itself created (ivory.pike).
 *
 * Page bodies are written once at creation; pages created before the
 * Markdown→blocks renderer landed carry their ticket body as literal Markdown
 * text. This maintenance pass rebuilds those pages' content in place:
 * wipe the page's top-level blocks, then append the freshly rendered
 * callout + body.
 *
 * Scope guard: ONLY pages whose creation is recorded in this config's run
 * ledger (`items[].action === "created"`) are touched — never imported or
 * adopted pages, whose content is human-owned. The wipe is wholesale by
 * design: these pages were machine-written and the ticket body is the source
 * of truth for them; any manual Notion edits to a sync-created page's BODY
 * are overwritten (the leading callout says exactly that).
 */

export interface BodyRepairItem {
  syncId: string;
  externalId: string;
  ticketId: string;
  title: string;
  outcome: "repaired" | "failed";
  reason?: string;
}

export interface BodyRepairResult {
  ok: boolean;
  error?: string;
  repaired: number;
  failed: number;
  items: BodyRepairItem[];
}

/** Hard cap per invocation — rerun for more (matches backfill's cap ethos). */
const MAX_REPAIR_PAGES = 200;

interface NotionBlockOps {
  listBlockChildrenIds(blockId: string): Promise<string[]>;
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

function createdExternalIdsFromLedger(
  runs: Array<{ items: Prisma.JsonValue }>,
): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    if (!Array.isArray(run.items)) continue;
    for (const raw of run.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      if (item.action !== "created") continue;
      if (typeof item.externalId === "string" && item.externalId.length > 0) {
        ids.add(item.externalId);
      }
    }
  }
  return ids;
}

export async function rerenderCreatedPageBodies(
  db: PrismaClient,
  params: {
    configId: string;
    deps?: { notionFactory?: NotionFactory };
  },
): Promise<BodyRepairResult> {
  const notionFactory =
    params.deps?.notionFactory ??
    (resolveNotionServiceForIntegration as unknown as NotionFactory);

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
      failed: 0,
      items: [],
    };
  }

  const resolved = await notionFactory(db, config.integrationId);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, repaired: 0, failed: 0, items: [] };
  }
  const notion = resolved.notion;

  // Provenance: the run ledger is the only place "we created this page" is
  // recorded — the sync record itself looks identical for imported pages.
  const runs = await db.ticketSyncRun.findMany({
    where: { configId: config.id, items: { not: Prisma.DbNull } },
    select: { items: true },
  });
  const createdIds = createdExternalIdsFromLedger(runs);
  if (createdIds.size === 0) {
    return { ok: true, repaired: 0, failed: 0, items: [] };
  }

  const syncs = await db.ticketSync.findMany({
    where: {
      configId: config.id,
      externalId: { in: [...createdIds] },
      tombstonedAt: null,
    },
    select: {
      id: true,
      externalId: true,
      ticket: {
        select: { id: true, title: true, body: true, number: true },
      },
    },
    take: MAX_REPAIR_PAGES,
  });

  const base = getPublicBaseUrlFromEnv();
  const workspaceSlug = config.product.workspace.slug;
  const productSlug = config.product.slug;

  const items: BodyRepairItem[] = [];
  let repaired = 0;
  let failed = 0;

  for (const sync of syncs) {
    const backlinkUrl = `${base}/w/${workspaceSlug}/products/${productSlug}/tickets/${sync.ticket.number}`;
    try {
      const blocks = buildBodyBlocks(sync.ticket.body, backlinkUrl);
      const existing = await notion.listBlockChildrenIds(sync.externalId);
      for (const blockId of existing) {
        await notion.deleteBlock(blockId);
      }
      await notion.appendBlockChildren(sync.externalId, blocks);
      repaired++;
      items.push({
        syncId: sync.id,
        externalId: sync.externalId,
        ticketId: sync.ticket.id,
        title: sync.ticket.title,
        outcome: "repaired",
      });
    } catch (error) {
      failed++;
      items.push({
        syncId: sync.id,
        externalId: sync.externalId,
        ticketId: sync.ticket.id,
        title: sync.ticket.title,
        outcome: "failed",
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return { ok: true, repaired, failed, items };
}
