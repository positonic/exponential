/**
 * The one seam through which a meeting summary reaches a Matrix room.
 *
 * Every caller — the tRPC procedure today, anything later — goes through here, so the
 * access check, the Off block, the repost guard and the post log cannot be bypassed by
 * adding a second entry point. Shaped after
 * `TranscriptionProcessingService.sendSlackNotification`, which is the existing
 * precedent for "post this meeting somewhere".
 *
 * **Never call this from an event handler.** Matrix has no un-send — only the bot can
 * redact its own events — so every post is a human deciding, once. `bulkAssignProject`
 * would otherwise turn one click into forty room messages, and assignment routinely
 * happens before summarization, so they would be forty empty ones.
 *
 * Returns a discriminated result and does not throw for expected states: "no
 * destination", "blocked off" and "needs confirmation" are answers the UI renders, not
 * exceptions.
 */

import type { ChannelLink, PrismaClient } from "@prisma/client";
import {
  canEditTranscription,
  getTranscriptionAccess,
} from "~/server/services/access";
import { reportHandledError } from "~/lib/reportHandledError";
import {
  MatrixApiError,
  MatrixEncryptedRoomError,
  type MatrixClient,
} from "./MatrixClient";
import { getMatrixClientForServer } from "./matrixServer";
import { resolveMatrixDestination } from "./resolveMatrixDestination";
import { renderMeetingSummary, type MeetingForSummary } from "./renderMeetingSummary";

export type PostMeetingSummaryResult =
  | { kind: "posted"; roomId: string; eventId: string; postLogId: string }
  | { kind: "blocked-off" }
  | { kind: "no-destination" }
  | { kind: "no-summary" }
  | { kind: "needs-confirm"; roomId: string; lastPostedAt: Date }
  | { kind: "no-access" }
  | { kind: "not-found" }
  | { kind: "failed"; reason: string };

export interface PostMeetingSummaryInput {
  meetingId: string;
  /** Explicit destination, chosen in the picker. Overrides resolution entirely. */
  roomId?: string;
  /** Which registered server to send through. Required alongside an explicit roomId. */
  serverId?: string;
  actorUserId: string;
  confirmRepost?: boolean;
  /** Injection point for tests; otherwise built from the resolved server's credentials. */
  client?: MatrixClient;
  /** Attempt number, folded into the transaction id so a retry cannot double-post. */
  attempt?: number;
}

/**
 * Matrix deduplicates on the transaction id, so deriving it from the post's identity
 * (rather than a clock or random value) makes a retried request the *same* message
 * instead of a second copy. Same meeting, same room, same attempt → same event.
 */
export function buildTransactionId(
  meetingId: string,
  roomId: string,
  attempt: number,
): string {
  // Room ids contain characters that are awkward in a URL path segment even encoded;
  // reducing to a stable slug keeps the id readable in homeserver logs.
  const roomSlug = roomId.replace(/[^a-zA-Z0-9]/g, "");
  return `expo-${meetingId}-${roomSlug}-${attempt}`;
}

export async function postMeetingSummaryToMatrix(
  db: PrismaClient,
  input: PostMeetingSummaryInput,
): Promise<PostMeetingSummaryResult> {
  const { meetingId, actorUserId, attempt = 0 } = input;

  const meeting = await db.transcriptionSession.findUnique({
    where: { id: meetingId },
    include: {
      project: { select: { id: true, name: true } },
      actions: { select: { id: true } },
    },
  });

  if (!meeting) return { kind: "not-found" };

  // ADR-0014's canonical resolver, not a bespoke check: posting a full summary into a
  // room is at least as sensitive as editing the meeting, so it takes edit access.
  const access = await getTranscriptionAccess(db, actorUserId, {
    id: meeting.id,
    userId: meeting.userId,
    projectId: meeting.projectId,
    workspaceId: meeting.workspaceId,
  });
  if (!canEditTranscription(access)) return { kind: "no-access" };

  // Resolution runs even when the caller picked a room explicitly, because `Off` has to
  // be consulted either way. Off is the confidential-project escape hatch; if choosing a
  // room in the picker could route around it, it would not be one.
  const destination = await resolveMatrixDestination(db, {
    projectId: meeting.projectId,
    workspaceId: meeting.workspaceId,
  });
  if (destination.kind === "off") return { kind: "blocked-off" };

  let roomId: string;
  let serverId: string;
  let link: ChannelLink | null = null;

  if (input.roomId) {
    if (!input.serverId) {
      return { kind: "failed", reason: "No Matrix server was given for that room." };
    }
    roomId = input.roomId;
    serverId = input.serverId;
    // A one-off post to a picked room is not a configuration change, so it is only
    // attributed to a binding when it happens to be that binding's room.
    if (destination.kind === "room" && destination.link.externalId === roomId) {
      link = destination.link;
    }
  } else {
    if (destination.kind === "none") return { kind: "no-destination" };
    if (!destination.link.serverIntegrationId) {
      return {
        kind: "failed",
        reason: "That room's binding has no Matrix server attached — re-bind the room.",
      };
    }

    link = destination.link;
    roomId = destination.link.externalId;
    serverId = destination.link.serverIntegrationId;
  }

  // A summary is the whole payload; posting without one would send a title and a link
  // to people who cannot open it.
  if (!meeting.summary?.trim()) return { kind: "no-summary" };

  // Already posted here? Matrix has no un-send, so a second copy is permanent.
  const previous = await db.matrixPostLog.findFirst({
    where: { transcriptionSessionId: meeting.id, roomId },
    orderBy: { postedAt: "desc" },
  });
  if (previous && !input.confirmRepost) {
    return { kind: "needs-confirm", roomId, lastPostedAt: previous.postedAt };
  }

  const rendered = renderMeetingSummary(meeting as MeetingForSummary);

  let client = input.client;
  if (!client) {
    if (!meeting.workspaceId) {
      return {
        kind: "failed",
        reason: "This meeting is not in a workspace, so no Matrix server applies.",
      };
    }
    client = (await getMatrixClientForServer(db, serverId, meeting.workspaceId)).client;
  }

  let eventId: string;
  try {
    ({ eventId } = await client.send(roomId, {
      html: rendered.html,
      text: rendered.text,
      txnId: buildTransactionId(meeting.id, roomId, attempt),
    }));
  } catch (error) {
    // A failure writes no log row: the log is the record of what actually reached a
    // room, and a phantom entry would make the repost guard refuse a post that never
    // happened. Reported rather than swallowed — a silent catch here is invisible.
    reportHandledError(error, {
      area: "matrix-post-summary",
      context: { meetingId, roomId, serverId },
    });
    return { kind: "failed", reason: describePostFailure(error) };
  }

  const postLog = await db.matrixPostLog.create({
    data: {
      transcriptionSessionId: meeting.id,
      channelLinkId: link?.id ?? null,
      roomId,
      serverIntegrationId: serverId,
      eventId,
      postedById: actorUserId,
    },
    select: { id: true },
  });

  return { kind: "posted", roomId, eventId, postLogId: postLog.id };
}

/** Each cause needs a different fix, so each gets its own sentence. */
function describePostFailure(error: unknown): string {
  if (error instanceof MatrixEncryptedRoomError) return error.message;
  if (error instanceof MatrixApiError) {
    if (error.status === 0) {
      return "Could not reach the homeserver. It may be down or unreachable from here.";
    }
    if (error.isForbidden) {
      return "The bot is not in that room, or is not allowed to post there. Invite it and try again.";
    }
    if (error.isUnauthorized) {
      return "The homeserver rejected the bot's access token. Re-register the server with a fresh token.";
    }
    return `The homeserver refused the message (HTTP ${error.status}).`;
  }
  return "The message could not be sent.";
}
