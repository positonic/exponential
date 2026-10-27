/**
 * Enqueue an outbound post. The producer's side of ADR-0075.
 *
 * This is a database write and nothing else: it resolves the destination for the
 * subject's kind and scope and inserts a `pending` row. It never contacts a homeserver
 * or Slack, so a provider outage cannot fail the write that called it. Delivery is
 * kicked by the caller — a router passes the returned ids to `after()`, the
 * `agentRuns/enqueue.ts` pattern — and the notification cron sweeps what is left.
 *
 * Never throws: like `recordActivity`, a failure here is reported and swallowed, because
 * a decision that was confirmed must stay confirmed whether or not a room hears of it.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { reportHandledError } from "~/lib/reportHandledError";
import { getProducer } from "./producers";
import { resolveOutboundDestination } from "./resolveDestinations";
import type { OutboundKind } from "./types";

export interface EmitOutboundPostInput {
  kind: OutboundKind;
  subjectId: string;
  /** What happened: "published" | "accepted" | "superseded" | … (producer-defined). */
  event: string;
  /** The person whose act this is; null for a system path. */
  actorUserId: string | null;
  /**
   * A post is caused only by a person's act (D-0056). An agent principal's write —
   * a draft, an agent-driven status change — never posts, whatever the event.
   */
  actorIsAgent: boolean;
}

/** Ids of the rows created, for the caller to kick. Empty when nothing was enqueued. */
export async function emitOutboundPost(
  db: PrismaClient,
  input: EmitOutboundPostInput,
): Promise<string[]> {
  if (input.actorIsAgent) return [];

  try {
    const producer = getProducer(input.kind);
    if (!producer) return [];

    const subject = await producer.load(db, input.subjectId);
    if (!subject) return [];

    const destination = await resolveOutboundDestination(db, {
      workspaceId: subject.workspaceId,
      projectId: subject.projectId,
      kind: input.kind,
    });
    if (destination.kind !== "room") return [];

    // One destination per scope and kind in V1 (see `resolveOutboundDestination`); the
    // array return and the per-destination unique are the shape the V2 fan-out keeps.
    const { link } = destination;
    try {
      const post = await db.outboundPost.create({
        data: {
          workspaceId: subject.workspaceId,
          kind: input.kind,
          subjectId: input.subjectId,
          event: input.event,
          channelLinkId: link.id,
          provider: link.provider,
          externalId: link.externalId,
          serverIntegrationId: link.serverIntegrationId,
          requestedById: input.actorUserId,
        },
        select: { id: true },
      });
      return [post.id];
    } catch (error) {
      // `@@unique([kind, subjectId, event, channelLinkId])`: this event already has a
      // row for this destination, so a second emit — a retried request, a double
      // click — is a no-op rather than a second message.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return [];
      }
      throw error;
    }
  } catch (error) {
    reportHandledError(error, {
      area: "outbound-post-emit",
      context: { kind: input.kind, subjectId: input.subjectId, event: input.event },
    });
    return [];
  }
}
