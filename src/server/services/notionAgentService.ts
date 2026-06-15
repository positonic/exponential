import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "~/server/db";
import { getDecryptedKey } from "~/server/utils/credentialHelper";
import { NotionService, type NotionSearchHit } from "./NotionService";

/**
 * notionAgentService — the deep module behind Zoe's Notion tools (ADR-0020).
 *
 * It resolves the user's Notion credential **server-side** (the credential never
 * enters the LLM context), instantiates a {@link NotionService}, and returns
 * lean, capped, `{connected}`-discriminated shapes the agent can pour into its
 * context cheaply.
 *
 * Credential discovery is workspace-scoped with a personal fallback: when a
 * `workspaceId` is in the turn context we resolve the `Integration` row for that
 * workspace, falling back to the user's workspace-less (personal) Notion
 * integration if none matches. This avoids cross-workspace credential bleed for
 * users who connect separate Notion accounts per workspace.
 *
 * The `NotionService` factory is injectable so the logic tests without network.
 */

/** Credential keyTypes that hold a usable Notion token, across legacy spellings. */
const ACCESS_TOKEN_KEY_TYPES = ["access_token", "ACCESS_TOKEN", "API_KEY"];

/**
 * Hard cap on rows returned from a single database query (Thread-cost discipline,
 * ADR-0020 §5). Zero auto-pagination — the agent pages via `nextCursor` instead.
 */
export const MAX_QUERY_ROWS = 25;

/**
 * Project a single Notion property to a scalar value the agent can reason over
 * cheaply, or `undefined` to exclude it. We deliberately drop rich-text blobs
 * (and other large/array shapes: relation, rollup, files) so a query result
 * stays small. The `title`-typed property is handled separately into `title`.
 */
function extractScalarValue(prop: any): unknown {
  switch (prop?.type) {
    case "number":
      return prop.number;
    case "select":
      return prop.select?.name ?? null;
    case "status":
      return prop.status?.name ?? null;
    case "multi_select":
      return prop.multi_select?.map((s: any) => s.name) ?? [];
    case "date":
      if (!prop.date) return null;
      return prop.date.end
        ? { start: prop.date.start, end: prop.date.end }
        : prop.date.start;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url ?? null;
    case "email":
      return prop.email ?? null;
    case "phone_number":
      return prop.phone_number ?? null;
    case "formula":
      return prop.formula?.[prop.formula?.type] ?? null;
    case "created_time":
      return prop.created_time ?? null;
    case "last_edited_time":
      return prop.last_edited_time ?? null;
    case "unique_id":
      return prop.unique_id
        ? `${prop.unique_id.prefix ?? ""}${prop.unique_id.number}`
        : null;
    default:
      // rich_text (the blob), title, relation, rollup, files, people → excluded
      return undefined;
  }
}

/** Scalar-only projection of a page's property bag (no rich-text blobs). */
function projectScalarProps(
  properties: Record<string, any>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (value?.type === "title") continue; // surfaced separately as `title`
    const scalar = extractScalarValue(value);
    if (scalar !== undefined) out[key] = scalar;
  }
  return out;
}

export type NotionConnection =
  | { connected: false }
  | { connected: true; service: NotionService };

export type NotionSearchResult =
  | { connected: false }
  | {
      connected: true;
      total: number;
      results: NotionSearchHit[];
      hasMore: boolean;
    };

export interface NotionRow {
  id: string;
  title: string;
  url: string;
  props: Record<string, unknown>;
}

export type NotionQueryResult =
  | { connected: false }
  | {
      connected: true;
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      rows: NotionRow[];
    };

type NotionServiceFactory = (accessToken: string) => NotionService;

export class NotionAgentService {
  private readonly db: PrismaClient;
  private readonly makeNotionService: NotionServiceFactory;

  constructor(opts?: {
    db?: PrismaClient;
    makeNotionService?: NotionServiceFactory;
  }) {
    this.db = opts?.db ?? defaultDb;
    this.makeNotionService =
      opts?.makeNotionService ?? ((token) => new NotionService(token));
  }

  /**
   * Resolve a connected {@link NotionService} for the user, or `{connected:false}`
   * when no Notion integration (or no usable token) is found.
   *
   * Workspace-scoped row wins; falls back to the personal (workspace-less) row.
   */
  async resolveService(
    userId: string,
    workspaceId?: string | null,
  ): Promise<NotionConnection> {
    const token = await this.resolveAccessToken(userId, workspaceId);
    if (!token) return { connected: false };
    return { connected: true, service: this.makeNotionService(token) };
  }

  private async resolveAccessToken(
    userId: string,
    workspaceId?: string | null,
  ): Promise<string | null> {
    // Workspace-scoped match first (when a workspace is in the turn context),
    // then the personal (workspaceId: null) integration as a fallback.
    let integration = workspaceId
      ? await this.findIntegration(userId, workspaceId)
      : null;
    integration ??= await this.findIntegration(userId, null);

    if (!integration) return null;

    const tokenCredential = integration.credentials.find((c) =>
      ACCESS_TOKEN_KEY_TYPES.includes(c.keyType),
    );
    if (!tokenCredential) return null;

    return getDecryptedKey(tokenCredential);
  }

  private async findIntegration(userId: string, workspaceId: string | null) {
    return this.db.integration.findFirst({
      where: { provider: "notion", userId, workspaceId },
      include: {
        credentials: {
          select: { key: true, keyType: true, isEncrypted: true },
        },
      },
    });
  }

  /**
   * Search the user's Notion for pages/databases by title/content.
   * Returns a lean shape (id/type/title/url) and distinguishes
   * "not connected" from "connected, zero matches".
   */
  async search(
    userId: string,
    workspaceId: string | null | undefined,
    query: string,
    filter?: "page" | "database",
  ): Promise<NotionSearchResult> {
    const connection = await this.resolveService(userId, workspaceId);
    if (!connection.connected) return { connected: false };

    const { results, hasMore } = await connection.service.search({
      query,
      filter,
    });

    return { connected: true, total: results.length, results, hasMore };
  }

  /**
   * Query one of the user's Notion databases (optional filter/sort) and return a
   * lean, capped result: at most {@link MAX_QUERY_ROWS} rows, each carrying only
   * scalar properties (no rich-text blobs). `hasMore`/`nextCursor` let the agent
   * page; the tool description coaches it to refine/page rather than slurp.
   */
  async queryDatabase(
    userId: string,
    workspaceId: string | null | undefined,
    databaseId: string,
    opts?: {
      filter?: unknown;
      sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
      startCursor?: string;
    },
  ): Promise<NotionQueryResult> {
    const connection = await this.resolveService(userId, workspaceId);
    if (!connection.connected) return { connected: false };

    const { results, hasMore, nextCursor } = await connection.service.queryDatabase({
      databaseId,
      filter: opts?.filter,
      sorts: opts?.sorts,
      pageSize: MAX_QUERY_ROWS,
      startCursor: opts?.startCursor,
    });

    const rows: NotionRow[] = results.map((page: any) => ({
      id: page.id,
      title: NotionService.extractTitleFromProperties(page.properties ?? {}),
      url: page.url ?? "",
      props: projectScalarProps(page.properties ?? {}),
    }));

    return { connected: true, total: rows.length, hasMore, nextCursor, rows };
  }
}
