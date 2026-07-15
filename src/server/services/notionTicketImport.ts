import type { Prisma, PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import { NotionAgentService } from "./notionAgentService";
import { NotionService } from "./NotionService";
import { DEFAULT_STATUS_MAP, normalizeName } from "./ticketSync/mapping";
import { runInboundTicketSync } from "./ticketSync/engine";
import { createNotionTicketSyncAdapter } from "./ticketSync/notionAdapter";

/**
 * notionTicketImport — agent-facing "import one Notion cycle" entrypoint.
 *
 * Since the standing product ↔ Notion sync landed, this is a thin contract
 * shim over the sync engine rather than its own importer: it resolves the
 * cycle page (id or exact-title search, unchanged agent ergonomics), ensures
 * the product has a sync config (creating one pinned to the caller's Notion
 * integration when missing), runs a **cycle-scoped inbound engine run**
 * (trigger: agent), and maps the run manifest back into the response shape
 * the Mastra tool has always consumed. Tickets it touches get sync records,
 * so the standing sync owns them from then on.
 *
 * Access control stays at the tRPC boundary (`loadProductWithAccess`) — this
 * module trusts `userId`/`workspaceId`, mirroring `createTicket.ts`.
 */

/** Same slug rule as `tag.create` so lookups hit the `[slug, workspaceId]` unique. */
function slugifyTagName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface NotionCycleImportParams {
  userId: string;
  /** Workspace of the target product; also scopes the Notion credential lookup. */
  workspaceId: string;
  productId: string;
  /** The Notion backlog database to import from. */
  notionDatabaseId: string;
  /** Notion page id of the cycle (from the cycles database). Wins over cycleName. */
  cyclePageId?: string;
  /** Cycle title to resolve via Notion search when no page id is given, e.g. "Cycle 10". */
  cycleName?: string;
  /** Relation property on the backlog database pointing at the cycles database. */
  relationProperty?: string;
  /** Workspace labels applied to every imported ticket (created on first use). */
  labels?: string[];
  /** Legacy: cycles now auto-create by their Notion title; a mismatch only warns. */
  targetCycleName?: string;
  /** Property-name overrides for non-default Notion schemas. */
  properties?: { status?: string; priority?: string; type?: string; effort?: string; label?: string };
  /** Map and report without writing anything. */
  dryRun?: boolean;
}

export interface MappedTicketPreview {
  title: string;
  status: TicketStatus;
  type: TicketType;
  priority?: number;
  points?: number;
  notionUrl: string;
  labels: string[];
  warnings: string[];
}

export type NotionCycleImportResult =
  | { connected: false }
  | {
      connected: true;
      error: string;
      candidates?: Array<{ id: string; title: string; url: string }>;
    }
  | {
      connected: true;
      error?: undefined;
      dryRun: boolean;
      cycle: { notionPageId: string; notionTitle: string; exponentialCycleId: string | null };
      totalFound: number;
      created: Array<{ id: string; number: number; shortId: string | null; title: string; status: string; warnings: string[] }>;
      skipped: Array<{ title: string; reason: string }>;
      failed: Array<{ title: string; error: string }>;
      preview?: MappedTicketPreview[];
      warnings: string[];
    };

/**
 * Resolve workspace tags by name (global or workspace-scoped), creating any
 * that don't exist yet as workspace `category:"label"` tags. Returns tag ids.
 */
export async function resolveOrCreateWorkspaceTags(
  db: PrismaClient,
  params: { workspaceId: string; userId: string; names: string[] },
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of params.names) {
    const slug = slugifyTagName(name);
    if (!slug) continue;
    const existing = await db.tag.findFirst({
      where: { slug, workspaceId: params.workspaceId },
    }) ?? await db.tag.findFirst({ where: { slug, workspaceId: null } });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const tag = await db.tag.create({
      data: {
        name,
        slug,
        color: "avatar-blue",
        category: "label",
        workspaceId: params.workspaceId,
        createdById: params.userId,
        isSystem: false,
      },
    });
    ids.push(tag.id);
  }
  return [...new Set(ids)];
}

/** Attach tags to a ticket, ignoring already-attached ones. */
export async function attachTicketTags(
  db: PrismaClient,
  ticketId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  await db.ticketTag.createMany({
    data: tagIds.map((tagId) => ({ ticketId, tagId })),
    skipDuplicates: true,
  });
}

export async function importNotionCycleTickets(
  db: PrismaClient,
  params: NotionCycleImportParams,
): Promise<NotionCycleImportResult> {
  const connection = await new NotionAgentService({ db }).resolveService(
    params.userId,
    params.workspaceId,
  );
  if (!connection.connected) return { connected: false };
  const notion = connection.service;

  const warnings: string[] = [];
  const relationProperty = params.relationProperty ?? "Cycles";
  const dryRun = params.dryRun ?? false;

  // ── 1. Resolve the Notion cycle page ────────────────────────────────────
  let cyclePageId = params.cyclePageId;
  let cycleTitle = params.cycleName ?? "";
  if (!cyclePageId) {
    if (!params.cycleName) {
      return { connected: true, error: "Provide cyclePageId or cycleName" };
    }
    const { results } = await notion.search({ query: params.cycleName, filter: "page" });
    const wanted = normalizeName(params.cycleName);
    const matches = results.filter((r) => normalizeName(r.title) === wanted);
    if (matches.length === 0) {
      return {
        connected: true,
        error: `No Notion page titled "${params.cycleName}" found`,
        candidates: results.slice(0, 5),
      };
    }
    if (matches.length > 1) {
      return {
        connected: true,
        error: `Multiple Notion pages titled "${params.cycleName}" — pass cyclePageId explicitly`,
        candidates: matches.slice(0, 5),
      };
    }
    cyclePageId = matches[0]!.id;
    cycleTitle = matches[0]!.title;
  } else if (!cycleTitle) {
    const { page } = await notion.getPageWithBlocks(cyclePageId);
    cycleTitle = NotionService.extractTitleFromProperties(page.properties ?? {});
  }

  // ── 2. Ensure the product has a standing sync config ────────────────────
  let config = await db.ticketSyncConfig.findUnique({
    where: { productId_provider: { productId: params.productId, provider: "notion" } },
  });

  if (!config) {
    // Pin the caller's Notion integration — same workspace-then-personal
    // fallback the credential resolution above used.
    const integration =
      (await db.integration.findFirst({
        where: {
          provider: "notion",
          userId: params.userId,
          workspaceId: params.workspaceId,
        },
        select: { id: true },
      })) ??
      (await db.integration.findFirst({
        where: { provider: "notion", userId: params.userId, workspaceId: null },
        select: { id: true },
      }));
    if (!integration) return { connected: false };

    // The engine needs a standing config; creating it here is idempotent and
    // is exactly what the settings UI would do. The warning surfaces it.
    config = await db.ticketSyncConfig.create({
      data: {
        productId: params.productId,
        provider: "notion",
        integrationId: integration.id,
        databaseId: params.notionDatabaseId,
        statusMap: DEFAULT_STATUS_MAP as unknown as Prisma.InputJsonValue,
        propertyNames: {
          ...(params.properties ?? {}),
          cycle: relationProperty,
        } as Prisma.InputJsonValue,
        createdById: params.userId,
      },
    });
    warnings.push(
      "Created a standing Notion sync link for this product (visible in product settings → Notion sync)",
    );
  } else if (config.databaseId !== params.notionDatabaseId) {
    warnings.push(
      "This product's standing sync is linked to a different Notion database; the linked database was used",
    );
  }

  if (
    params.targetCycleName &&
    normalizeName(params.targetCycleName) !== normalizeName(cycleTitle)
  ) {
    warnings.push(
      "targetCycleName overrides are no longer supported — the Exponential cycle auto-creates from the Notion cycle title",
    );
  }

  // ── 3. Cycle-scoped engine run ──────────────────────────────────────────
  const adapterResult = await createNotionTicketSyncAdapter(db, config);
  if (!adapterResult.ok) {
    return { connected: true, error: adapterResult.error };
  }

  const run = await runInboundTicketSync(db, adapterResult.adapter, {
    configId: config.id,
    trigger: "agent",
    dryRun,
    scope: { relationProperty, relationContains: cyclePageId },
  });

  // ── 4. Agent labels on created tickets (e.g. FROM-NOTION) ───────────────
  const labelNames = params.labels ?? ["FROM-NOTION"];
  const createdItems = run.items.filter(
    (i) => i.action === "created" && i.ticketId,
  );
  if (!dryRun && createdItems.length > 0 && labelNames.length > 0) {
    const tagIds = await resolveOrCreateWorkspaceTags(db, {
      workspaceId: params.workspaceId,
      userId: params.userId,
      names: labelNames,
    });
    for (const item of createdItems) {
      await attachTicketTags(db, item.ticketId!, tagIds);
    }
  }

  // ── 5. Map the run manifest back into the tool's response contract ──────
  const createdTickets =
    createdItems.length > 0
      ? await db.ticket.findMany({
          where: { id: { in: createdItems.map((i) => i.ticketId!) } },
          select: { id: true, number: true, shortId: true, title: true, status: true },
        })
      : [];
  const createdById = new Map(createdTickets.map((t) => [t.id, t]));

  const created = createdItems.flatMap((item) => {
    const ticket = item.ticketId ? createdById.get(item.ticketId) : undefined;
    if (!ticket) return [];
    return [
      {
        id: ticket.id,
        number: ticket.number,
        shortId: ticket.shortId,
        title: ticket.title,
        status: ticket.status as string,
        warnings: item.reason ? [item.reason] : [],
      },
    ];
  });

  const skipped = run.items
    .filter((i) =>
      ["skipped", "updated", "conflict", "archived"].includes(i.action),
    )
    .map((i) => ({
      title: i.title,
      reason:
        i.action === "skipped"
          ? (i.reason ?? "already in sync")
          : `${i.action}: ${i.reason ?? "synced existing ticket"}`,
    }));

  const failed = run.items
    .filter((i) => i.action === "failed")
    .map((i) => ({ title: i.title, error: i.reason ?? "unknown error" }));

  const preview: MappedTicketPreview[] = dryRun
    ? run.items
        .filter((i) => i.action === "created" && i.preview)
        .map((i) => ({
          title: i.title,
          status: i.preview!.status,
          type: i.preview!.type,
          priority: i.preview!.priority ?? undefined,
          points: i.preview!.points ?? undefined,
          notionUrl: i.preview!.url ?? "",
          labels: labelNames,
          warnings: i.reason ? [i.reason] : [],
        }))
    : [];

  const sprint = await db.list.findFirst({
    where: {
      workspaceId: params.workspaceId,
      listType: "SPRINT",
      name: { equals: cycleTitle, mode: "insensitive" },
    },
    select: { id: true },
  });

  return {
    connected: true,
    dryRun,
    cycle: {
      notionPageId: cyclePageId,
      notionTitle: cycleTitle,
      exponentialCycleId: sprint?.id ?? null,
    },
    totalFound: run.items.filter((i) => i.action !== "adopted").length,
    created,
    skipped,
    failed,
    ...(dryRun ? { preview } : {}),
    warnings,
  };
}
