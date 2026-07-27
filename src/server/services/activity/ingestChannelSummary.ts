/**
 * ingestChannelSummary — the routing + idempotency logic behind the
 * `recordChannelSummary` endpoint (ADR-0023).
 *
 * Given a finished summary tagged only with `(provider, externalId)` (the
 * gateway knows nothing about workspaces/projects), this:
 *   1. **Resolves** the `ChannelLink` by `(provider, externalId)`.
 *   2. **Drops** silently if there is no active link (orphan/unconfigured
 *      channel → nothing written).
 *   3. **Dedups** by `(provider, externalId, windowStart)` — an at-least-once
 *      re-delivery updates the existing event rather than inserting a second
 *      feed row.
 *   4. **Records** one `channel_summary` `WorkspaceActivityEvent` (reusing the
 *      `recordActivity` primitive for the insert path), routed to the link's
 *      workspace, with `userId = ChannelLink.createdById`.
 *
 * Takes an explicit `db` handle so it is callable from the endpoint and
 * unit-testable with a mocked Prisma client.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { resolveChannelLink } from "~/server/services/channelLinkService";
import { recordActivity } from "./recordActivity";

export interface IngestChannelSummaryInput {
  provider: string;
  externalId: string;
  summary: string;
  displayName?: string | null;
  windowStart: string;
  windowEnd: string;
  messageCount: number;
}

export type IngestChannelSummaryResult =
  | { status: "dropped" }
  | { status: "recorded"; eventId: string; deduped: boolean };

/**
 * Stable per-window identity used to dedup re-deliveries. Encodes the ADR's
 * `(provider, externalId, windowStart)` dedup key into the `entityId` column so
 * no JSON-path query (or new unique index) is required.
 */
function summaryEntityId(
  provider: string,
  externalId: string,
  windowStartIso: string,
): string {
  return `${provider}:${externalId}:${windowStartIso}`;
}

export async function ingestChannelSummary(
  db: PrismaClient,
  input: IngestChannelSummaryInput,
): Promise<IngestChannelSummaryResult> {
  const link = await resolveChannelLink(db, input.provider, input.externalId);
  if (!link) {
    // Orphan / unconfigured channel — drop silently (ADR-0023).
    return { status: "dropped" };
  }

  // Normalize the window bounds so the dedup key is canonical regardless of the
  // exact string the gateway sent.
  const windowStartIso = new Date(input.windowStart).toISOString();
  const windowEndIso = new Date(input.windowEnd).toISOString();
  const entityId = summaryEntityId(input.provider, input.externalId, windowStartIso);

  const metadata: Prisma.InputJsonObject = {
    provider: input.provider,
    externalId: input.externalId,
    displayName: input.displayName ?? null,
    projectId: link.projectId ?? null,
    messageCount: input.messageCount,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    summary: input.summary,
  };

  // Dedup by (provider, externalId, windowStart): upsert, not insert. A second
  // delivery for the same window updates the existing feed row in place.
  const existing = await db.workspaceActivityEvent.findFirst({
    where: {
      workspaceId: link.workspaceId,
      entityType: "channel_summary",
      entityId,
    },
    select: { id: true },
  });

  if (existing) {
    await db.workspaceActivityEvent.update({
      where: { id: existing.id },
      data: {
        userId: link.createdById,
        action: "summarized",
        metadata,
      },
    });
    return { status: "recorded", eventId: existing.id, deduped: true };
  }

  await recordActivity(db, {
    workspaceId: link.workspaceId,
    userId: link.createdById,
    entityType: "channel_summary",
    entityId,
    action: "summarized",
    metadata,
  });

  return { status: "recorded", eventId: entityId, deduped: false };
}
