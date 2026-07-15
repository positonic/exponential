import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../NotionService";
import { getDecryptedKey } from "~/server/utils/credentialHelper";
import { firstOptionName, readOptionNames } from "./mapping";
import type { RemoteTicketRow, TicketSyncRemoteAdapter } from "./engine";

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

export class NotionTicketSyncAdapter implements TicketSyncRemoteAdapter {
  constructor(
    private readonly notion: NotionService,
    private readonly propertyNames: PropertyNames,
    /** Our integration's bot user id, for echo suppression. */
    private readonly botId: string | null,
  ) {}

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
    // unique cycle (resolvePageTitle already swallows per-page failures).
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
          async (id) => [id, await this.resolvePageTitle(id)] as const,
        ),
      ),
    );
    for (const row of rows) {
      if (!row.cycleRelationId) continue;
      row.cycleName = titleCache.get(row.cycleRelationId) ?? null;
    }

    return rows;
  }

  private async resolvePageTitle(pageId: string): Promise<string | null> {
    try {
      const page = (await this.notion.getPage(pageId)) as RawNotionPage;
      return NotionService.extractTitleFromProperties(page.properties ?? {});
    } catch {
      return null;
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
  const integration = await db.integration.findFirst({
    where: { id: config.integrationId, provider: "notion" },
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

  const accessToken = getDecryptedKey(tokenCredential);
  if (!accessToken) {
    return { ok: false, error: "Failed to decrypt the Notion access token" };
  }

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

  return {
    ok: true,
    adapter: new NotionTicketSyncAdapter(
      new NotionService(accessToken),
      resolvePropertyNames(config.propertyNames),
      botId,
    ),
  };
}
