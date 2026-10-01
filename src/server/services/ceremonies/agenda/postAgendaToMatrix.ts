/**
 * Post an occurrence's agenda to the ceremony's Matrix room (ADR-0059),
 * generalising the meeting-summary post: the same registered-server client
 * and a transaction id derived from the post's identity so a retry cannot
 * double-post. The message itself is rendered from the structured sections
 * (`renderAgendaMessage`), not the narrative.
 *
 * Two deliberate differences from `postMeetingSummaryToMatrix`:
 * - `MatrixPostLog` requires a `TranscriptionSession`, and the schema is not
 *   ours to change here, so the record of an agenda post lives in the agenda
 *   snapshot (`matrixPosts`) — the repost guard reads it from there.
 * - The ceremony stores only a room id; the server is resolved from the
 *   workspace's registered Matrix servers (the only one, or the one whose
 *   bot has joined the room).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { getMatrixClientForServer, listMatrixServers } from "~/server/services/matrix/matrixServer";
import { readAgendaSnapshot, type AgendaMatrixPost, type AgendaSnapshot } from "./types";
import { withAgendaTransaction } from "./items";
import { renderAgendaMessage } from "./renderAgendaMessage";

export type { AgendaMatrixPost } from "./types";

export type PostAgendaResult =
  | { kind: "posted"; roomId: string; eventId: string }
  | { kind: "already-posted"; roomId: string; postedAt: string }
  | { kind: "no-room" }
  | { kind: "no-agenda" }
  | { kind: "no-server"; reason: string }
  | { kind: "failed"; reason: string };

interface MinimalClient {
  joinedRooms(): Promise<string[]>;
  send(roomId: string, body: { html: string; text: string; txnId: string }): Promise<{ eventId: string }>;
}

export function buildAgendaTransactionId(occurrenceId: string, roomId: string, attempt: number): string {
  const roomSlug = roomId.replace(/[^a-zA-Z0-9]/g, "");
  return `expo-agenda-${occurrenceId}-${roomSlug}-${attempt}`;
}

async function resolveServerId(db: PrismaClient, workspaceId: string, roomId: string, client?: MinimalClient): Promise<{ serverId: string } | { reason: string }> {
  const servers = await listMatrixServers(db, workspaceId);
  if (servers.length === 0) return { reason: "No Matrix server is registered in this workspace." };
  if (servers.length === 1 || client) return { serverId: servers[0]!.id };
  for (const server of servers) {
    try {
      const { client: c } = await getMatrixClientForServer(db, server.id, workspaceId);
      if ((await c.joinedRooms()).includes(roomId)) return { serverId: server.id };
    } catch {
      // A server that cannot be reached cannot be the one; try the next.
    }
  }
  return { reason: "None of the workspace's Matrix servers has joined that room." };
}

export async function postAgendaToMatrix(
  db: PrismaClient,
  input: { occurrenceId: string; actorUserId: string | null; confirmRepost?: boolean; client?: MinimalClient; appUrl?: string },
): Promise<PostAgendaResult> {
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: input.occurrenceId },
    select: {
      id: true,
      scheduledStart: true,
      agenda: true,
      ceremony: { select: { id: true, name: true, timezone: true, matrixRoomId: true, workspaceId: true, workspace: { select: { slug: true } } } },
    },
  });
  if (!occurrence) return { kind: "failed", reason: "Occurrence not found." };
  const roomId = occurrence.ceremony.matrixRoomId;
  if (!roomId) return { kind: "no-room" };
  const agenda = readAgendaSnapshot(occurrence.agenda);
  if (!agenda) return { kind: "no-agenda" };

  const previous = agenda.matrixPosts ?? [];
  const priorHere = previous.filter((p) => p.roomId === roomId);
  if (priorHere.length > 0 && !input.confirmRepost) {
    return { kind: "already-posted", roomId, postedAt: priorHere[priorHere.length - 1]!.postedAt };
  }

  const resolved = await resolveServerId(db, occurrence.ceremony.workspaceId, roomId, input.client);
  if ("reason" in resolved) return { kind: "no-server", reason: resolved.reason };
  const { serverId } = resolved;

  let when: string;
  try {
    when = occurrence.scheduledStart.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: occurrence.ceremony.timezone });
  } catch {
    when = occurrence.scheduledStart.toISOString();
  }
  const base = input.appUrl ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const message = renderAgendaMessage({
    ceremonyName: occurrence.ceremony.name,
    when,
    agenda,
    url: `${base}/w/${occurrence.ceremony.workspace.slug}/ceremonies/${occurrence.ceremony.id}/${occurrence.id}`,
    baseUrl: base,
  });

  let client: MinimalClient | undefined = input.client;
  if (!client) client = (await getMatrixClientForServer(db, serverId, occurrence.ceremony.workspaceId)).client;

  let eventId: string;
  try {
    ({ eventId } = await client.send(roomId, {
      html: message.html,
      text: message.text,
      txnId: buildAgendaTransactionId(occurrence.id, roomId, priorHere.length),
    }));
  } catch (error) {
    reportHandledErrorServer(error, { area: "ceremonies.postAgendaToMatrix", context: { occurrenceId: occurrence.id, roomId, serverId } });
    return { kind: "failed", reason: error instanceof Error ? error.message : "Matrix rejected the post." };
  }

  const post: AgendaMatrixPost = { roomId, serverId, eventId, postedAt: new Date().toISOString(), postedById: input.actorUserId };
  // Re-read inside the transaction and append only the ledger entry: the
  // Matrix round-trip above is long enough for someone to have resolved or
  // added an item, and writing the snapshot we read at the top would revert
  // it. The send has already happened, so a failure here must not be fatal —
  // the worst case is a repost prompt the reader can confirm.
  try {
    await withAgendaTransaction(db, async (tx) => {
      const fresh = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrence.id }, select: { agenda: true } });
      const current = readAgendaSnapshot(fresh?.agenda) ?? agenda;
      const next: AgendaSnapshot = { ...current, matrixPosts: [...(current.matrixPosts ?? []), post] };
      await tx.ceremonyOccurrence.update({
        where: { id: occurrence.id },
        data: { agenda: next as unknown as Prisma.InputJsonValue },
      });
    });
  } catch (error) {
    reportHandledErrorServer(error, {
      area: "ceremonies.postAgendaToMatrix: could not record the post",
      context: { occurrenceId: occurrence.id, roomId, eventId },
    });
  }
  return { kind: "posted", roomId, eventId };
}
