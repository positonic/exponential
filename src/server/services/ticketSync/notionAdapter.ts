import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../NotionService";
import { decryptCredentialResult } from "~/server/utils/credentialHelper";
import { firstOptionName, readOptionNames } from "./mapping";
import type { RemoteTicketRow, TicketSyncRemoteAdapter } from "./engine";
import type { TicketPushAdapter } from "./push";
import type { NotionDbSchema } from "./outboundMapping";

/**
 * ticketSync/notionAdapter — the real {@link TicketSyncRemoteAdapter}.
 *
 * Projects raw Notion database pages into the engine's flat
 * {@link RemoteTicketRow} shape: title, the configured status/priority/type/
 * effort/label property values (names overridable via
 * `TicketSyncConfig.propertyNames`), trash state, last-edit time, and whether
 * the last editor was our own integration bot (echo suppression).
 */

interface PropertyNames {
  status: string;
  priority: string;
  type: string;
  effort: string;
  label: string;
  cycle: string;
  assignee: string;
}

const DEFAULT_PROPERTY_NAMES: PropertyNames = {
  status: "Status",
  priority: "Priority",
  type: "Type",
  effort: "Effort",
  label: "Label",
  cycle: "Cycles",
  assignee: "Assignee",
};

export function resolvePropertyNames(raw: unknown): PropertyNames {
  const overrides =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<PropertyNames>)
      : {};
  return { ...DEFAULT_PROPERTY_NAMES, ...overrides };
}

/** Hard cap on rows pulled in one run — same guardrail as the importer. */
const MAX_SYNC_ROWS = 500;
const NOTION_PAGE_SIZE = 100;

interface RawNotionPage {
  id: string;
  url?: string;
  archived?: boolean;
  in_trash?: boolean;
  last_edited_time?: string;
  last_edited_by?: { id?: string };
  properties?: Record<string, unknown>;
}

function firstRelationId(
  props: Record<string, unknown>,
  property: string,
): string | null {
  const prop = props?.[property] as
    | { type?: string; relation?: Array<{ id?: string }> | null }
    | undefined;
  if (prop?.type !== "relation") return null;
  return prop.relation?.[0]?.id ?? null;
}

function firstPersonEmail(
  props: Record<string, unknown>,
  property: string,
): string | null {
  const prop = props?.[property] as
    | { type?: string; people?: Array<{ person?: { email?: string } }> | null }
    | undefined;
  if (prop?.type !== "people") return null;
  return prop.people?.[0]?.person?.email ?? null;
}

/**
 * Safety stop for the back-link probe's pagination. 100 rows per page, so this
 * covers 500 pages carrying one ticket's back-link — pathological by any
 * measure, and the bound keeps a mis-scoped filter from paging a whole
 * database.
 */
const BACKLINK_PROBE_MAX_PAGES = 5;

export class NotionTicketSyncAdapter
  implements TicketSyncRemoteAdapter, TicketPushAdapter
{
  /**
   * Per-instance memo of `getRawDatabaseById`. A backfill drain builds one
   * adapter per run and then asks for the same database's schema once per
   * ticket — through getWriteSchema, the back-link probe, and the cycle
   * lookup. Without this, mirroring N tickets costs ~3N schema fetches
   * against a ~3 req/s API. An adapter is scoped to a single run, so the
   * schema cannot go stale in any way that matters.
   */
  private readonly rawDatabaseCache = new Map<
    string,
    Promise<{ properties: Record<string, unknown> }>
  >();

  constructor(
    private readonly notion: NotionService,
    private readonly propertyNames: PropertyNames,
    /** Our integration's bot user id, for echo suppression. */
    private readonly botId: string | null,
  ) {}

  private getRawDatabase(
    databaseId: string,
  ): Promise<{ properties: Record<string, unknown> }> {
    const cached = this.rawDatabaseCache.get(databaseId);
    if (cached) return cached;
    // Cache the PROMISE, not the result: concurrent callers within one run
    // then share a single in-flight request instead of racing three of them.
    const pending = this.notion.getRawDatabaseById(databaseId).catch((err) => {
      // A failed fetch must not be memoised — the next call should retry.
      this.rawDatabaseCache.delete(databaseId);
      throw err;
    }) as Promise<{ properties: Record<string, unknown> }>;
    this.rawDatabaseCache.set(databaseId, pending);
    return pending;
  }

  async queryRows(params: {
    databaseId: string;
    editedAfter?: Date;
    relationScope?: { property: string; contains: string };
  }): Promise<RemoteTicketRow[]> {
    const clauses: unknown[] = [];
    if (params.editedAfter) {
      clauses.push({
        timestamp: "last_edited_time" as const,
        last_edited_time: { after: params.editedAfter.toISOString() },
      });
    }
    if (params.relationScope) {
      clauses.push({
        property: params.relationScope.property,
        relation: { contains: params.relationScope.contains },
      });
    }
    const filter =
      clauses.length === 0
        ? undefined
        : clauses.length === 1
          ? clauses[0]
          : { and: clauses };

    const pages: RawNotionPage[] = [];
    let cursor: string | undefined;
    while (pages.length < MAX_SYNC_ROWS) {
      const page = await this.notion.queryDatabase({
        databaseId: params.databaseId,
        filter,
        pageSize: NOTION_PAGE_SIZE,
        startCursor: cursor,
      });
      pages.push(...(page.results as RawNotionPage[]));
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const rows = pages
      .slice(0, MAX_SYNC_ROWS)
      .map((page) => this.projectRow(page));

    // Resolve cycle relation ids → page titles, one concurrent lookup per
    // unique cycle. An unreadable page (connection lacks access to the Cycles
    // database) is flagged, NOT collapsed into "no cycle" — the engine treats
    // the remote cycle as unknown and surfaces a warning (frosty.flame).
    const uniqueCycleIds = [
      ...new Set(
        rows
          .map((row) => row.cycleRelationId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const titleCache = new Map(
      await Promise.all(
        uniqueCycleIds.map(
          async (id) => [id, await this.resolveCycleTitle(id)] as const,
        ),
      ),
    );
    for (const row of rows) {
      if (!row.cycleRelationId) continue;
      const resolved = titleCache.get(row.cycleRelationId);
      row.cycleName = resolved?.title ?? null;
      if (resolved?.unreadable) row.cycleUnreadable = true;
    }

    return rows;
  }

  private async resolveCycleTitle(
    pageId: string,
  ): Promise<{ title: string | null; unreadable: boolean }> {
    try {
      const page = (await this.notion.getPage(pageId)) as RawNotionPage;
      return {
        title: NotionService.extractTitleFromProperties(page.properties ?? {}),
        unreadable: false,
      };
    } catch {
      return { title: null, unreadable: true };
    }
  }


  private projectRow(
    page: RawNotionPage,
  ): RemoteTicketRow & { cycleRelationId: string | null } {
    const props = page.properties ?? {};
    return {
      externalId: page.id,
      url: page.url ?? null,
      title: NotionService.extractTitleFromProperties(props),
      rawStatus: firstOptionName(props, this.propertyNames.status),
      rawPriority: firstOptionName(props, this.propertyNames.priority),
      rawType: firstOptionName(props, this.propertyNames.type),
      rawEffort: firstOptionName(props, this.propertyNames.effort),
      labels: readOptionNames(props, this.propertyNames.label),
      cycleName: null, // filled from cycleRelationId after the query pass
      cycleRelationId: firstRelationId(props, this.propertyNames.cycle),
      assigneeEmail: firstPersonEmail(props, this.propertyNames.assignee),
      lastEditedAt: page.last_edited_time
        ? new Date(page.last_edited_time)
        : new Date(0),
      lastEditedByBot:
        !!this.botId && page.last_edited_by?.id === this.botId,
      archived: Boolean(page.archived ?? page.in_trash),
    };
  }

  /** Flatten the page's blocks into plain-text-with-markdown-accents. */
  async getPageBody(externalId: string): Promise<string | null> {
    try {
      const { blocks } = await this.notion.getPageWithBlocks(externalId);
      const lines: string[] = [];
      for (const block of blocks as Array<Record<string, unknown>>) {
        const line = renderBlock(block);
        if (line !== null) lines.push(line);
      }
      const text = lines.join("\n").trim();
      return text.length > 0 ? text : null;
    } catch {
      // Body is copy-on-create nicety, never worth failing the row over.
      return null;
    }
  }

  // ── Outbound (TicketPushAdapter) ────────────────────────────────────────

  /** Current remote state of one page; null when it 404s (page deleted). */
  async getRow(externalId: string): Promise<RemoteTicketRow | null> {
    let page: RawNotionPage;
    try {
      page = (await this.notion.getPage(externalId)) as RawNotionPage;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const row = this.projectRow(page);
    if (row.cycleRelationId) {
      const resolved = await this.resolveCycleTitle(row.cycleRelationId);
      row.cycleName = resolved.title;
      if (resolved.unreadable) row.cycleUnreadable = true;
    }
    const { cycleRelationId: _cycleRelationId, ...rest } = row;
    return rest;
  }

  /** The target database's property schema: type + option names per property. */
  async getWriteSchema(databaseId: string): Promise<NotionDbSchema> {
    const { properties } = await this.getRawDatabase(databaseId);
    const schema: NotionDbSchema = {};
    for (const [name, raw] of Object.entries(properties)) {
      const prop = raw as {
        type?: string;
        select?: { options?: Array<{ name?: string }> };
        status?: { options?: Array<{ name?: string }> };
        multi_select?: { options?: Array<{ name?: string }> };
      };
      const type = prop.type ?? "unknown";
      const optionSource =
        prop.select ?? prop.status ?? prop.multi_select ?? null;
      const options = (optionSource?.options ?? [])
        .map((o) => o.name)
        .filter((n): n is string => Boolean(n));
      schema[name] = { type, options };
    }
    return schema;
  }

  async updatePage(
    externalId: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await this.notion.updatePage({ pageId: externalId, properties });
  }

  /**
   * Resolve a cycle page id by title within the cycle relation's target
   * database. Never creates a page (ADR-0046 defers Exponential-born cycles);
   * returns null when nothing matches, so the caller warns and skips.
   */
  async findCyclePageIdByName(
    databaseId: string,
    cycleProperty: string,
    name: string,
  ): Promise<string | null> {
    const { properties } = await this.getRawDatabase(databaseId);
    const relation = properties[cycleProperty] as
      | { type?: string; relation?: { database_id?: string } }
      | undefined;
    const targetDbId = relation?.relation?.database_id;
    if (relation?.type !== "relation" || !targetDbId) return null;

    const target = await this.getRawDatabase(targetDbId);
    const titleProp = Object.entries(target.properties).find(
      ([, p]) => (p as { type?: string }).type === "title",
    )?.[0];

    const page = await this.notion.queryDatabase({
      databaseId: targetDbId,
      filter: titleProp
        ? { property: titleProp, title: { equals: name } }
        : undefined,
      pageSize: 25,
    });
    const wanted = name.trim().toLowerCase();
    const match = (page.results as RawNotionPage[]).find(
      (p) =>
        NotionService.extractTitleFromProperties(p.properties ?? {})
          .trim()
          .toLowerCase() === wanted,
    );
    return match?.id ?? null;
  }

  /**
   * Rows in the target database whose back-link property equals `ticketUrl` —
   * the pre-create probe for a page we already created for this ticket.
   *
   * Returns null when the database has no url-typed property under that name,
   * so the caller can tell "cannot check" from "checked, found nothing". Only
   * this adapter's create path ever writes that property with that URL, which
   * is what makes the match exact rather than a guess. Trashed pages are
   * excluded by the query itself; archived ones are filtered here.
   */
  async findPagesByBacklink(
    databaseId: string,
    backlinkProperty: string,
    ticketUrl: string,
  ): Promise<Array<{ externalId: string; url: string | null }> | null> {
    const { properties } = await this.getRawDatabase(databaseId);
    const prop = properties[backlinkProperty] as
      | { type?: string }
      | undefined;
    if (prop?.type !== "url") return null;

    // Page the whole result set. A single page of 25 would both truncate the
    // "reconcile the others" list and — because archived rows are filtered
    // client-side, AFTER the cap — let a page of trashed rows hide the live
    // match and cause a duplicate create.
    const live: Array<{ externalId: string; url: string | null }> = [];
    let cursor: string | undefined;
    for (let page = 0; page < BACKLINK_PROBE_MAX_PAGES; page++) {
      const res = await this.notion.queryDatabase({
        databaseId,
        filter: { property: backlinkProperty, url: { equals: ticketUrl } },
        pageSize: 100,
        startCursor: cursor,
      });
      for (const p of res.results as RawNotionPage[]) {
        if (!p.archived && !p.in_trash) {
          live.push({ externalId: p.id, url: p.url ?? null });
        }
      }
      if (!res.hasMore || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return live;
  }

  /**
   * Rows whose title matches `title` — used ONLY to warn a human in the
   * backfill preview, never to drive an automatic create/adopt decision.
   * Titles are user-editable, mutate in place, and are not unique, so they
   * are a hint for a person and nothing more.
   *
   * Notion's `title.equals` filter is exact and case-sensitive; the client
   * side re-checks case-insensitively after trimming.
   */
  async findPagesByTitle(
    databaseId: string,
    title: string,
  ): Promise<Array<{ externalId: string; url: string | null }>> {
    const wanted = title.trim().toLowerCase();
    if (!wanted) return [];

    const { properties } = await this.getRawDatabase(databaseId);
    const titleProp = Object.entries(properties).find(
      ([, p]) => (p as { type?: string }).type === "title",
    )?.[0];

    const page = await this.notion.queryDatabase({
      databaseId,
      filter: titleProp
        ? { property: titleProp, title: { equals: title.trim() } }
        : undefined,
      pageSize: 25,
    });

    return (page.results as RawNotionPage[])
      .filter((p) => !p.archived && !p.in_trash)
      .filter(
        (p) =>
          NotionService.extractTitleFromProperties(p.properties ?? {})
            .trim()
            .toLowerCase() === wanted,
      )
      .map((p) => ({ externalId: p.id, url: p.url ?? null }));
  }

  /** Resolve a Notion workspace person id by email, or null when unmatched. */
  async findPersonIdByEmail(email: string): Promise<string | null> {
    const wanted = email.trim().toLowerCase();
    const users = await this.notion.getWorkspaceUsers();
    const match = users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === wanted,
    );
    return match?.id ?? null;
  }

  /** Create a new page (full-mirror creation) with body `children` blocks. */
  async createPage(params: {
    databaseId: string;
    titleProperty: string | null;
    properties: Record<string, unknown>;
    children: unknown[];
  }): Promise<{ externalId: string; url: string | null }> {
    const { id, url } = await this.notion.createPageWithContent({
      databaseId: params.databaseId,
      properties: params.properties,
      children: params.children,
    });
    return { externalId: id, url };
  }

  /** Trash (archive) a page — the outbound half of archive ↔ archive. */
  async archivePage(externalId: string): Promise<void> {
    await this.notion.archivePage(externalId);
  }
}

/** A Notion API "object not found" error (a deleted/moved page). */
function isNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "object_not_found"
  );
}

interface RichTextItem {
  plain_text?: string;
}

function richText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return (value as RichTextItem[]).map((t) => t.plain_text ?? "").join("");
}

function renderBlock(block: Record<string, unknown>): string | null {
  const type = block.type as string | undefined;
  if (!type) return null;
  const payload = block[type] as { rich_text?: unknown } | undefined;
  const text = richText(payload?.rich_text);
  switch (type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `- [ ] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return text ? `\`\`\`\n${text}\n\`\`\`` : null;
    case "paragraph":
      return text;
    case "divider":
      return "---";
    default:
      return text || null;
  }
}

/**
 * Build the real adapter for a sync config: decrypt the pinned integration's
 * access token and read its bot id from the stored connection metadata.
 * Returns null (with a reason) when the credential is unusable — callers
 * surface that as a connection error, not a crash.
 */
/**
 * Resolve a working NotionService (and bot id) for a Notion integration's
 * stored credential. Shared by the sync adapter factory and maintenance
 * paths (e.g. the body re-render repair) that need raw block access the
 * adapter interfaces deliberately don't expose.
 */
export async function resolveNotionServiceForIntegration(
  db: PrismaClient,
  integrationId: string,
): Promise<
  | { ok: true; notion: NotionService; botId: string | null }
  | { ok: false; error: string }
> {
  const integration = await db.integration.findFirst({
    where: { id: integrationId, provider: "notion" },
    include: {
      credentials: { select: { key: true, keyType: true, isEncrypted: true } },
    },
  });
  if (!integration) {
    return { ok: false, error: "Notion integration not found" };
  }

  const tokenCredential = integration.credentials.find((c) =>
    ["access_token", "ACCESS_TOKEN", "API_KEY"].includes(c.keyType),
  );
  if (!tokenCredential) {
    return { ok: false, error: "No access token on the Notion integration" };
  }

  const tokenResult = decryptCredentialResult(tokenCredential.key, tokenCredential.isEncrypted);
  if (!tokenResult.ok) {
    // Distinguish a key problem from a missing credential — a wrong/rotated
    // DATABASE_ENCRYPTION_KEY must be alertable, not read as "not configured".
    console.error(
      `[notionAdapter] Notion access token exists but cannot be decrypted (reason: ${tokenResult.reason}) for integration ${integration.id}`,
    );
    return {
      ok: false,
      error:
        tokenResult.reason === 'auth_failed'
          ? "Notion access token failed to decrypt (wrong or rotated encryption key?)"
          : tokenResult.reason === 'no_key'
            ? "Notion access token is encrypted but DATABASE_ENCRYPTION_KEY is not set"
            : "Notion access token row is not valid ciphertext",
    };
  }
  const accessToken = tokenResult.value;

  let botId: string | null = null;
  const metadataCredential = integration.credentials.find(
    (c) => c.keyType === "notion_metadata",
  );
  if (metadataCredential) {
    try {
      const metadata = JSON.parse(metadataCredential.key) as Record<string, unknown>;
      botId = typeof metadata.botId === "string" ? metadata.botId : null;
    } catch {
      botId = null;
    }
  }

  return { ok: true, notion: new NotionService(accessToken), botId };
}

export async function createNotionTicketSyncAdapter(
  db: PrismaClient,
  config: {
    integrationId: string;
    propertyNames: unknown;
  },
): Promise<
  | { ok: true; adapter: NotionTicketSyncAdapter }
  | { ok: false; error: string }
> {
  const resolved = await resolveNotionServiceForIntegration(
    db,
    config.integrationId,
  );
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    adapter: new NotionTicketSyncAdapter(
      resolved.notion,
      resolvePropertyNames(config.propertyNames),
      resolved.botId,
    ),
  };
}
