/**
 * deriveActivitySource — the single, pure mapping from an activity event to its
 * **Activity source** (ADR-0023). Drives both the read-side source tagging and
 * the per-provider source switcher chip.
 *
 *   - `channel_summary` events return `metadata.provider` (e.g. "whatsapp"),
 *     since channel summaries are `WorkspaceActivityEvent` rows distinguished by
 *     provider, not by a separate table.
 *   - GitHub-origin rows return `"github"`.
 *   - everything else returns `"internal"` (things that happened inside
 *     Exponential — actions, tickets, projects, goals, …).
 *
 * Pure and database-free so the chip behavior is unit-testable without a DB.
 */

/** Fallback source for a `channel_summary` row missing a provider in metadata. */
export const CHANNEL_SOURCE_FALLBACK = "channel";

/**
 * Entity-type prefix marking a row as GitHub-origin. Shared with the feed's
 * `source` filter so the read-side `where` clause and this derivation can never
 * disagree about what counts as GitHub.
 */
export const GITHUB_ENTITY_PREFIX = "github";

/** The single source chip all GitHub event types collapse to. */
export const GITHUB_SOURCE = "github";

export interface ActivitySourceInput {
  entityType: string;
  metadata?: unknown;
}

export function deriveActivitySource(event: ActivitySourceInput): string {
  if (event.entityType === "channel_summary") {
    const provider = readProvider(event.metadata);
    return provider ?? CHANNEL_SOURCE_FALLBACK;
  }

  // GitHub events keep their own `GitHubActivity` table (distinct shape + a
  // second consumer, SprintAnalytics) but also append a `WorkspaceActivityEvent`
  // so they reach the shared surfaces — see githubFeedEvent.ts. Every entity
  // type they emit carries this prefix, and they all collapse to one chip.
  if (event.entityType.startsWith(GITHUB_ENTITY_PREFIX)) {
    return GITHUB_SOURCE;
  }

  return "internal";
}

function readProvider(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const provider = (metadata as Record<string, unknown>).provider;
    if (typeof provider === "string" && provider.trim().length > 0) {
      return provider;
    }
  }
  return null;
}
