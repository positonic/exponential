/**
 * Auto-attach recorded meetings to ceremony occurrences (ADR-0059). Called
 * at every place a `TranscriptionSession` row is created (Fireflies webhook,
 * Fireflies bulk sync, device upload, manual create) and by the hourly
 * meeting-summary sweep as a catch-up for rows that predate their ceremony.
 * The decision itself is the pure `matchOccurrence`; this module loads the
 * candidates and persists the link. Never throws to its caller: an attach
 * failure must not fail an ingestion, so errors are reported and swallowed.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { matchOccurrence, type OccurrenceCandidate, type OccurrenceMatch } from "./matchOccurrence";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AttachableMeeting {
  id: string;
  title: string | null;
  meetingDate: Date | null;
  workspaceId: string | null;
  userId: string | null;
  calendarExternalId?: string | null;
}

/** How far either side of the meeting date candidate occurrences are loaded. */
const CANDIDATE_WINDOW_MS = 36 * 60 * 60_000;

/**
 * Candidate occurrences for a meeting: the meeting's workspace when it has
 * one, otherwise every workspace the recording user belongs to (a Fireflies
 * import lands without a workspace). Restricted to a window around the
 * meeting date so the alias rule has something to bite on; the calendar rule
 * needs no window but a recurrence id is only ever compared against the
 * same candidate set.
 */
export async function loadOccurrenceCandidates(
  db: Db,
  meeting: AttachableMeeting,
): Promise<Array<OccurrenceCandidate & { workspaceId: string }>> {
  if (!meeting.meetingDate && !meeting.calendarExternalId) return [];
  if (!meeting.workspaceId && !meeting.userId) return [];

  const rows = await db.ceremonyOccurrence.findMany({
    where: {
      ...(meeting.workspaceId
        ? { workspaceId: meeting.workspaceId }
        : { workspace: { members: { some: { userId: meeting.userId! } } } }),
      ceremony: { isActive: true },
      ...(meeting.meetingDate
        ? {
            scheduledStart: {
              gte: new Date(meeting.meetingDate.getTime() - CANDIDATE_WINDOW_MS),
              lte: new Date(meeting.meetingDate.getTime() + CANDIDATE_WINDOW_MS),
            },
          }
        : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      scheduledStart: true,
      ceremony: { select: { aliases: true, durationMinutes: true } },
      scheduledMeeting: { select: { icalUid: true } },
    },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    scheduledStart: r.scheduledStart,
    durationMinutes: r.ceremony.durationMinutes,
    aliases: r.ceremony.aliases,
    scheduledMeetingIcalUid: r.scheduledMeeting?.icalUid ?? null,
  }));
}

export interface AttachOutcome {
  meetingId: string;
  match: OccurrenceMatch | null;
  /** Set when the meeting had no workspace and inherited the occurrence's. */
  workspaceAssigned?: string;
}

/**
 * Match and persist. Returns the outcome (null match = left unattached); on
 * any error reports it and returns a null match so the caller's flow
 * continues. Pass `dryRun` to compute without writing.
 */
export async function attachMeetingToOccurrence(
  db: Db,
  meeting: AttachableMeeting,
  opts: { dryRun?: boolean } = {},
): Promise<AttachOutcome> {
  try {
    const candidates = await loadOccurrenceCandidates(db, meeting);
    const match = matchOccurrence(meeting, candidates);
    if (!match) return { meetingId: meeting.id, match: null };
    const winner = candidates.find((c) => c.id === match.occurrenceId)!;
    const workspaceAssigned = meeting.workspaceId ? undefined : winner.workspaceId;
    if (!opts.dryRun) {
      await db.transcriptionSession.update({
        where: { id: meeting.id },
        data: {
          occurrenceId: match.occurrenceId,
          ...(workspaceAssigned ? { workspaceId: workspaceAssigned } : {}),
        },
      });
    }
    return { meetingId: meeting.id, match, workspaceAssigned };
  } catch (error) {
    reportHandledErrorServer(error, {
      area: "ceremonies.autoAttach",
      context: { meetingId: meeting.id },
    });
    return { meetingId: meeting.id, match: null };
  }
}

export interface CatchUpResult {
  scanned: number;
  attached: number;
}

/**
 * Catch-up for recordings created before their ceremony existed: recent,
 * dated, titled, workspace-scoped rows with no occurrence yet. Bounded so it
 * fits inside the sweep's request budget.
 */
export async function attachUnlinkedMeetings(
  db: Db,
  opts: { now?: Date; lookbackDays?: number; limit?: number; userId?: string } = {},
): Promise<CatchUpResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.lookbackDays ?? 30) * 86_400_000);
  const rows = await db.transcriptionSession.findMany({
    where: {
      occurrenceId: null,
      archivedAt: null,
      workspaceId: { not: null },
      title: { not: null },
      meetingDate: { gte: since },
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { meetingDate: "desc" },
    take: opts.limit ?? 100,
    select: { id: true, title: true, meetingDate: true, workspaceId: true, userId: true },
  });
  let attached = 0;
  for (const row of rows) {
    const outcome = await attachMeetingToOccurrence(db, row);
    if (outcome.match) attached += 1;
  }
  return { scanned: rows.length, attached };
}
