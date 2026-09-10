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
import { recordOccurrenceCaptured } from "./activity";
import {
  BACKFILL_SLACK_MS,
  backfillAnchorDate,
  matchOccurrence,
  type OccurrenceCandidate,
  type OccurrenceMatch,
} from "./matchOccurrence";

type Db = PrismaClient | Prisma.TransactionClient;

/** A transaction client has no `$transaction`; the root client does. */
function isRootClient(db: Db): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

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
/** Backfill loads a wider band to cover its ±24h match slack plus duration. */
const BACKFILL_CANDIDATE_WINDOW_MS = 3 * 24 * 60 * 60_000;

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
  opts: { windowMs?: number } = {},
): Promise<Array<OccurrenceCandidate & { workspaceId: string; ceremonyName: string; timezone: string }>> {
  if (!meeting.meetingDate && !meeting.calendarExternalId) return [];
  if (!meeting.workspaceId && !meeting.userId) return [];
  const windowMs = opts.windowMs ?? CANDIDATE_WINDOW_MS;

  const rows = await db.ceremonyOccurrence.findMany({
    where: {
      ...(meeting.workspaceId
        ? { workspaceId: meeting.workspaceId }
        : { workspace: { members: { some: { userId: meeting.userId! } } } }),
      ceremony: { isActive: true },
      ...(meeting.meetingDate
        ? {
            scheduledStart: {
              gte: new Date(meeting.meetingDate.getTime() - windowMs),
              lte: new Date(meeting.meetingDate.getTime() + windowMs),
            },
          }
        : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      scheduledStart: true,
      ceremony: { select: { name: true, timezone: true, aliases: true, durationMinutes: true } },
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
    ceremonyName: r.ceremony.name,
    timezone: r.ceremony.timezone,
    scheduledMeetingIcalUid: r.scheduledMeeting?.icalUid ?? null,
  }));
}

export interface AttachOutcome {
  meetingId: string;
  match: OccurrenceMatch | null;
  /** Set when the meeting had no workspace and inherited the occurrence's. */
  workspaceAssigned?: string;
  /** True when an alias matched in more than one of the user's workspaces, so nothing was attached. */
  ambiguousWorkspaces?: boolean;
}

/**
 * Match and persist. Returns the outcome (null match = left unattached); on
 * any error reports it and returns a null match so the caller's flow
 * continues. Pass `dryRun` to compute without writing.
 */
export async function attachMeetingToOccurrence(
  db: Db,
  meeting: AttachableMeeting,
  opts: { dryRun?: boolean; via?: string } = {},
): Promise<AttachOutcome> {
  try {
    const candidates = await loadOccurrenceCandidates(db, meeting);
    const match = matchOccurrence(meeting, candidates);
    if (!match) return { meetingId: meeting.id, match: null };
    const winner = candidates.find((c) => c.id === match.occurrenceId)!;
    // A workspace-less import may only be filed by alias when exactly one of
    // the user's workspaces claims it; an alias hit in a second workspace
    // makes the placement a guess, so leave it unattached for a person.
    if (!meeting.workspaceId && match.reason === "alias") {
      const elsewhere = matchOccurrence(
        meeting,
        candidates.filter((c) => c.workspaceId !== winner.workspaceId),
      );
      if (elsewhere) return { meetingId: meeting.id, match: null, ambiguousWorkspaces: true };
    }
    const workspaceAssigned = meeting.workspaceId ? undefined : winner.workspaceId;
    if (!opts.dryRun) {
      await db.transcriptionSession.update({
        where: { id: meeting.id },
        data: {
          occurrenceId: match.occurrenceId,
          ...(workspaceAssigned ? { workspaceId: workspaceAssigned } : {}),
        },
      });
      // recordActivity needs the root client; inside a transaction the
      // caller records instead (attach is never called inside one today).
      if (isRootClient(db)) {
        await recordOccurrenceCaptured(db, {
          workspaceId: winner.workspaceId,
          occurrenceId: winner.id,
          ceremonyName: winner.ceremonyName,
          scheduledStart: winner.scheduledStart,
          timezone: winner.timezone,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          actorUserId: meeting.userId,
          via: opts.via ?? "ingestion",
        });
      }
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

export interface BackfillRow {
  meetingId: string;
  title: string | null;
  anchorDate: Date;
  occurrenceId: string | null;
  ceremonyName: string | null;
  scheduledStart: Date | null;
  reason: string;
}

/**
 * Backfill for one workspace (ADR-0059): every unattached, unarchived
 * recorded meeting is matched with the backfill anchor and the wide window,
 * and reported; rows are written only when `dryRun` is false. Occurrences
 * for the window are assumed to exist (the caller expands active ceremonies
 * from their `startsOn` first).
 */
export async function backfillWorkspaceAttachments(
  db: Db,
  workspaceId: string,
  opts: { dryRun: boolean; limit?: number; actorUserId?: string | null },
): Promise<BackfillRow[]> {
  const meetings = await db.transcriptionSession.findMany({
    where: {
      OR: [{ workspaceId }, { project: { workspaceId } }],
      occurrenceId: null,
      archivedAt: null,
      title: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 500,
    select: { id: true, title: true, meetingDate: true, createdAt: true, workspaceId: true, userId: true },
  });

  const rows: BackfillRow[] = [];
  if (meetings.length === 0) return rows;

  // One occurrence load per workspace covering every anchor (plus the match
  // band), matched in memory — not one query per recording.
  const anchors = meetings.map((m) => backfillAnchorDate(m));
  const minAnchor = new Date(Math.min(...anchors.map((a) => a.getTime())) - BACKFILL_CANDIDATE_WINDOW_MS);
  const maxAnchor = new Date(Math.max(...anchors.map((a) => a.getTime())) + BACKFILL_CANDIDATE_WINDOW_MS);
  const occurrenceRows = await db.ceremonyOccurrence.findMany({
    where: {
      workspaceId,
      ceremony: { isActive: true },
      scheduledStart: { gte: minAnchor, lte: maxAnchor },
    },
    select: {
      id: true,
      workspaceId: true,
      scheduledStart: true,
      ceremony: { select: { name: true, timezone: true, aliases: true, durationMinutes: true } },
      scheduledMeeting: { select: { icalUid: true } },
    },
  });
  const all = occurrenceRows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    scheduledStart: r.scheduledStart,
    durationMinutes: r.ceremony.durationMinutes,
    aliases: r.ceremony.aliases,
    ceremonyName: r.ceremony.name,
    timezone: r.ceremony.timezone,
    scheduledMeetingIcalUid: r.scheduledMeeting?.icalUid ?? null,
  }));

  for (const [index, meeting] of meetings.entries()) {
    const anchorDate = anchors[index]!;
    const probe = { ...meeting, workspaceId, meetingDate: anchorDate };
    const lo = anchorDate.getTime() - BACKFILL_CANDIDATE_WINDOW_MS;
    const hi = anchorDate.getTime() + BACKFILL_CANDIDATE_WINDOW_MS;
    const candidates = all.filter((c) => c.scheduledStart.getTime() >= lo && c.scheduledStart.getTime() <= hi);
    const match = matchOccurrence(probe, candidates, { slackMs: BACKFILL_SLACK_MS });
    if (!match) {
      rows.push({
        meetingId: meeting.id,
        title: meeting.title,
        anchorDate,
        occurrenceId: null,
        ceremonyName: null,
        scheduledStart: null,
        reason: candidates.length === 0 ? "no occurrences near the anchor date" : "no alias matched the title",
      });
      continue;
    }
    const winner = candidates.find((c) => c.id === match.occurrenceId)!;
    if (!opts.dryRun) {
      await db.transcriptionSession.update({
        where: { id: meeting.id },
        data: { occurrenceId: match.occurrenceId, ...(meeting.workspaceId ? {} : { workspaceId }) },
      });
      if (isRootClient(db)) {
        await recordOccurrenceCaptured(db, {
          workspaceId,
          occurrenceId: winner.id,
          ceremonyName: winner.ceremonyName,
          scheduledStart: winner.scheduledStart,
          timezone: winner.timezone,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          actorUserId: opts.actorUserId ?? null,
          via: "backfill",
        });
      }
    }
    rows.push({
      meetingId: meeting.id,
      title: meeting.title,
      anchorDate,
      occurrenceId: match.occurrenceId,
      ceremonyName: winner.ceremonyName,
      scheduledStart: winner.scheduledStart,
      reason: match.reason === "calendar" ? "calendar recurrence id" : `alias "${match.alias}"${meeting.meetingDate ? "" : " (anchored on title date or import date)"}`,
    });
  }
  return rows;
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
  if (rows.length === 0) return { scanned: 0, attached };

  // One occurrence load per workspace spanning every meeting date in it,
  // matched in memory (the backfill's batching), then a write per match.
  const byWorkspace = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byWorkspace.get(row.workspaceId!) ?? [];
    list.push(row);
    byWorkspace.set(row.workspaceId!, list);
  }
  for (const [wsId, wsRows] of byWorkspace) {
    const times = wsRows.map((r) => r.meetingDate!.getTime());
    const occurrenceRows = await db.ceremonyOccurrence.findMany({
      where: {
        workspaceId: wsId,
        ceremony: { isActive: true },
        scheduledStart: {
          gte: new Date(Math.min(...times) - CANDIDATE_WINDOW_MS),
          lte: new Date(Math.max(...times) + CANDIDATE_WINDOW_MS),
        },
      },
      select: {
        id: true,
        workspaceId: true,
        scheduledStart: true,
        ceremony: { select: { name: true, timezone: true, aliases: true, durationMinutes: true } },
        scheduledMeeting: { select: { icalUid: true } },
      },
    });
    const all = occurrenceRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      scheduledStart: r.scheduledStart,
      durationMinutes: r.ceremony.durationMinutes,
      aliases: r.ceremony.aliases,
      ceremonyName: r.ceremony.name,
      timezone: r.ceremony.timezone,
      scheduledMeetingIcalUid: r.scheduledMeeting?.icalUid ?? null,
    }));
    for (const row of wsRows) {
      try {
        const at = row.meetingDate!.getTime();
        const candidates = all.filter(
          (c) => c.scheduledStart.getTime() >= at - CANDIDATE_WINDOW_MS && c.scheduledStart.getTime() <= at + CANDIDATE_WINDOW_MS,
        );
        const match = matchOccurrence(row, candidates);
        if (!match) continue;
        const winner = candidates.find((c) => c.id === match.occurrenceId)!;
        await db.transcriptionSession.update({ where: { id: row.id }, data: { occurrenceId: match.occurrenceId } });
        if (isRootClient(db)) {
          await recordOccurrenceCaptured(db, {
            workspaceId: wsId,
            occurrenceId: winner.id,
            ceremonyName: winner.ceremonyName,
            scheduledStart: winner.scheduledStart,
            timezone: winner.timezone,
            meetingId: row.id,
            meetingTitle: row.title,
            actorUserId: row.userId,
            via: "catch-up",
          });
        }
        attached += 1;
      } catch (error) {
        reportHandledErrorServer(error, { area: "ceremonies.autoAttach.catchUp", context: { meetingId: row.id } });
      }
    }
  }
  return { scanned: rows.length, attached };
}
