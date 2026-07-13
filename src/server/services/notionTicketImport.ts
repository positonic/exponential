import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { NotionAgentService } from "./notionAgentService";
import { NotionService } from "./NotionService";

/**
 * notionTicketImport — import one Notion backlog cycle into a product's tickets.
 *
 * Codifies the flow an agent previously had to improvise turn-by-turn (find the
 * cycle page, build the relation filter, map fields, label, avoid duplicates)
 * into a single deterministic, idempotent server-side operation:
 *
 *   1. Resolve the Notion "Cycle" page (by page id, or by exact-title search).
 *   2. Query the backlog database filtered on the cycle relation property,
 *      paginating server-side (the agent's 25-row cap doesn't apply here).
 *   3. Map Notion properties → Ticket fields via tolerant heuristics
 *      (status names, "1 - High" priorities, "L (5pts)" efforts, typed titles).
 *   4. Skip rows already imported — provenance lives in `Ticket.links.notionPageId`,
 *      with a (title, cycle) fallback for tickets created before this existed.
 *   5. Create tickets through the shared `createTicketWithNumber` service and
 *      attach workspace labels (created on first use, e.g. "FROM-NOTION").
 *
 * Access control stays at the tRPC boundary (`loadProductWithAccess`) — this
 * module trusts `userId`/`workspaceId`, mirroring `createTicket.ts`.
 */

/** Hard cap on rows pulled from Notion in one import run. */
export const MAX_IMPORT_ROWS = 200;

/** Notion page size used while paginating the filtered backlog query. */
const NOTION_PAGE_SIZE = 100;

const TICKET_STATUSES = [
  "BACKLOG", "NEEDS_REFINEMENT", "READY_TO_PLAN", "COMMITTED",
  "IN_PROGRESS", "BLOCKED", "QA", "DONE", "DEPLOYED", "ARCHIVED",
] as const;

/**
 * Notion status/select name → TicketStatus. Keys are normalized (lowercased,
 * emoji/punctuation stripped). Anything unmapped falls back to BACKLOG with a
 * per-ticket warning rather than failing the row.
 */
export const STATUS_MAP: Record<string, TicketStatus> = {
  "backlog": "BACKLOG",
  "triage": "BACKLOG",
  "todo": "BACKLOG",
  "to do": "BACKLOG",
  "needs refinement": "NEEDS_REFINEMENT",
  "refinement": "NEEDS_REFINEMENT",
  "ready to plan": "READY_TO_PLAN",
  "ready": "READY_TO_PLAN",
  "planned": "COMMITTED",
  "committed": "COMMITTED",
  "in progress": "IN_PROGRESS",
  "doing": "IN_PROGRESS",
  "blocked": "BLOCKED",
  "qa": "QA",
  "qa ready": "QA",
  "qa-ready": "QA",
  "in review": "QA",
  "review": "QA",
  "done": "DONE",
  "complete": "DONE",
  "completed": "DONE",
  "deployed": "DEPLOYED",
  "shipped": "DEPLOYED",
  "archived": "ARCHIVED",
  "cancelled": "ARCHIVED",
  "canceled": "ARCHIVED",
  "wont do": "ARCHIVED",
};

/** Substring → TicketType, checked in order. Falls back to FEATURE. */
const TYPE_HINTS: Array<[string, TicketType]> = [
  ["bug", "BUG"],
  ["spike", "SPIKE"],
  ["research", "RESEARCH"],
  ["chore", "CHORE"],
  ["improvement", "IMPROVEMENT"],
  ["ticket", "FEATURE"],
];

/** Lowercase and strip emoji/symbols so "🚨 Bug" and "QA-ready" match tables. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Same slug rule as `tag.create` so lookups hit the `[slug, workspaceId]` unique. */
function slugifyTagName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapStatus(raw: string | null): { status: TicketStatus; warning?: string } {
  if (!raw) return { status: "BACKLOG" };
  const key = normalizeName(raw);
  // Exact enum name passed through (e.g. a Notion status literally named "QA").
  const asEnum = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const direct = TICKET_STATUSES.find((s) => s === asEnum);
  const mapped = STATUS_MAP[key] ?? direct;
  if (!mapped) {
    return { status: "BACKLOG", warning: `Status "${raw}" not recognized — defaulted to BACKLOG` };
  }
  return { status: mapped };
}

/** "1 - High" / "P2" / "0 - Critical" → 0..4, else undefined. */
function mapPriority(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /\d/.exec(raw);
  if (!match) return undefined;
  const n = parseInt(match[0], 10);
  return n >= 0 && n <= 4 ? n : undefined;
}

/** "L (5pts)" / "3 pts" / "M (3pts)" → numeric points, else undefined. */
function mapPoints(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*pts?/i.exec(raw);
  if (!match?.[1]) return undefined;
  return parseFloat(match[1]);
}

function mapType(raw: string | null): TicketType {
  if (!raw) return "FEATURE";
  const key = normalizeName(raw);
  for (const [hint, type] of TYPE_HINTS) {
    if (key.includes(hint)) return type;
  }
  return "FEATURE";
}

/** Read a select/status/multi-select property's name(s) from a raw Notion page. */
function readOptionNames(props: Record<string, any>, property: string): string[] {
  const prop = props?.[property];
  if (!prop) return [];
  if (prop.type === "select") return prop.select?.name ? [prop.select.name as string] : [];
  if (prop.type === "status") return prop.status?.name ? [prop.status.name as string] : [];
  if (prop.type === "multi_select") {
    return (prop.multi_select ?? []).map((s: any) => s.name as string).filter(Boolean);
  }
  return [];
}

function firstOptionName(props: Record<string, any>, property: string): string | null {
  return readOptionNames(props, property)[0] ?? null;
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
  /** Exponential cycle (SPRINT list) name to assign; defaults to the Notion cycle title. */
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
  const propNames = {
    status: params.properties?.status ?? "Status",
    priority: params.properties?.priority ?? "Priority",
    type: params.properties?.type ?? "Type",
    effort: params.properties?.effort ?? "Effort",
    label: params.properties?.label ?? "Label",
  };
  const relationProperty = params.relationProperty ?? "Cycles";

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

  // ── 2. Pull all rows related to the cycle ───────────────────────────────
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion.queryDatabase({
      databaseId: params.notionDatabaseId,
      filter: { property: relationProperty, relation: { contains: cyclePageId } },
      pageSize: NOTION_PAGE_SIZE,
      startCursor: cursor,
    });
    rows.push(...page.results);
    cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
  } while (cursor && rows.length < MAX_IMPORT_ROWS);
  if (rows.length > MAX_IMPORT_ROWS) {
    rows.length = MAX_IMPORT_ROWS;
    warnings.push(`Import capped at ${MAX_IMPORT_ROWS} rows`);
  }

  // ── 3. Resolve the target Exponential cycle (SPRINT list) ───────────────
  const targetCycleName = params.targetCycleName ?? cycleTitle;
  const sprint = targetCycleName
    ? await db.list.findFirst({
        where: {
          workspaceId: params.workspaceId,
          listType: "SPRINT",
          name: { equals: targetCycleName, mode: "insensitive" },
        },
        select: { id: true, name: true },
      })
    : null;
  const exponentialCycleId = sprint?.id ?? null;
  if (!exponentialCycleId && targetCycleName) {
    warnings.push(`No Exponential cycle named "${targetCycleName}" in the workspace — tickets left unassigned`);
  }

  // ── 4. Dedup index: provenance links first, (title, cycle) fallback ─────
  const existing = await db.ticket.findMany({
    where: { productId: params.productId },
    select: { title: true, cycleId: true, links: true },
  });
  const seenNotionIds = new Set<string>();
  const seenTitleCycle = new Set<string>();
  for (const t of existing) {
    const links = t.links as Record<string, unknown> | null;
    const notionPageId = links?.notionPageId;
    if (typeof notionPageId === "string") seenNotionIds.add(notionPageId);
    seenTitleCycle.add(`${normalizeName(t.title)}::${t.cycleId ?? ""}`);
  }

  // ── 5. Map + create ─────────────────────────────────────────────────────
  const labelNames = params.labels ?? ["FROM-NOTION"];
  const tagIds = params.dryRun
    ? []
    : await resolveOrCreateWorkspaceTags(db, {
        workspaceId: params.workspaceId,
        userId: params.userId,
        names: labelNames,
      });

  const created: Array<{ id: string; number: number; shortId: string | null; title: string; status: string; warnings: string[] }> = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const failed: Array<{ title: string; error: string }> = [];
  const preview: MappedTicketPreview[] = [];

  for (const row of rows) {
    const props = row.properties ?? {};
    const title = NotionService.extractTitleFromProperties(props);
    const notionUrl: string = row.url ?? "";
    const notionPageId: string = row.id;

    if (title === "Untitled") {
      skipped.push({ title, reason: "Untitled Notion row" });
      continue;
    }
    if (seenNotionIds.has(notionPageId)) {
      skipped.push({ title, reason: "Already imported (Notion page id match)" });
      continue;
    }
    if (seenTitleCycle.has(`${normalizeName(title)}::${exponentialCycleId ?? ""}`)) {
      skipped.push({ title, reason: "A ticket with this title already exists in the target cycle" });
      continue;
    }

    const rowWarnings: string[] = [];
    const { status, warning: statusWarning } = mapStatus(firstOptionName(props, propNames.status));
    if (statusWarning) rowWarnings.push(statusWarning);
    const priority = mapPriority(firstOptionName(props, propNames.priority));
    const points = mapPoints(firstOptionName(props, propNames.effort));
    const type = mapType(firstOptionName(props, propNames.type));
    const notionLabels = readOptionNames(props, propNames.label);

    const bodyLines = [`Imported from Notion: ${notionUrl}`];
    if (notionLabels.length > 0) bodyLines.push(`Notion labels: ${notionLabels.join(", ")}`);

    if (params.dryRun) {
      preview.push({ title, status, type, priority, points, notionUrl, labels: labelNames, warnings: rowWarnings });
      continue;
    }

    try {
      const ticket = await createTicketWithNumber(db, {
        productId: params.productId,
        workspaceId: params.workspaceId,
        createdById: params.userId,
        title,
        body: bodyLines.join("\n\n"),
        type,
        status,
        priority,
        points,
        cycleId: exponentialCycleId,
        links: { notion: notionUrl, notionPageId },
      });
      await attachTicketTags(db, ticket.id, tagIds);
      seenNotionIds.add(notionPageId);
      seenTitleCycle.add(`${normalizeName(title)}::${exponentialCycleId ?? ""}`);
      created.push({
        id: ticket.id,
        number: ticket.number,
        shortId: ticket.shortId,
        title: ticket.title,
        status: ticket.status,
        warnings: rowWarnings,
      });
    } catch (err) {
      failed.push({ title, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    connected: true,
    dryRun: params.dryRun ?? false,
    cycle: { notionPageId: cyclePageId, notionTitle: cycleTitle, exponentialCycleId },
    totalFound: rows.length,
    created,
    skipped,
    failed,
    ...(params.dryRun ? { preview } : {}),
    warnings,
  };
}
