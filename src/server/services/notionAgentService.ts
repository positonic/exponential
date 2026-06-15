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
}
