import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { partitionActions } from "~/lib/actions/partition";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildTranscriptionAccessWhere } from "~/server/services/access";
import {
  eventsOnLocalDay,
  summaryWindow,
  type CalendarReader,
  type SummaryWindow,
} from "./calendar";
import { matchRecordingsToEvents } from "./matcher";
import type {
  DailySummaryActionItem,
  DailySummaryDigest,
  DailySummaryYesterdayItem,
} from "./types";

export interface BuildDailySummaryOptions {
  /**
   * Calendar reader for the yesterday/today sections. Defaults to the
   * multi-calendar merge the `/calendar` page uses (Google + Microsoft + ICS +
   * Scheduled meetings); tests inject a fixture reader so no unit test ever
   * reaches an external provider.
   */
  readCalendar?: CalendarReader;
}

/**
 * Same base-URL resolution as the email and Matrix channels, so every link in
 * the digest points at the same origin as the deep links those channels
 * append. Resolved per build (not at module load) so cron and tests both see
 * the live environment.
 */
export function summaryBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();
}

/** First whitespace-separated token of the user's name, else "there". */
export function firstNameOf(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "there";
}

/**
 * Production calendar reader. Imported lazily so the builder (and everything
 * that imports it, including the cron seam under test) does not load the
 * Google/Microsoft clients and the shared Prisma singleton at module load.
 */
const defaultCalendarReader: CalendarReader = async (userId, timeMin, timeMax) => {
  const { getEventsMultiCalendar } = await import("~/server/services");
  return getEventsMultiCalendar(userId, timeMin.toISOString(), timeMax.toISOString());
};

/**
 * Today's actions for the digest: exactly the `todays` bucket of the shared
 * `partitionActions` (ADR-0034) over the same ownership set as
 * `action.getTodaysActions` — created-by-me-with-no-assignees OR assigned-to-me,
 * `ACTIVE`, across every workspace — plus the overdue count.
 *
 * `partitionActions` buckets by server-local calendar day. Shifting every
 * instant into the user's timezone frame first (`toZonedTime`, the same shift
 * `summaries.ts` applies to decide the fire window) makes "today" the user's
 * local day without re-implementing the buckets here.
 */
async function loadTodaysActions(
  db: PrismaClient,
  userId: string,
  localNow: Date,
  tz: string,
): Promise<{ todaysActions: DailySummaryActionItem[]; overdueCount: number }> {
  const actions = await db.action.findMany({
    where: {
      OR: [
        { createdById: userId, assignees: { none: {} } },
        { assignees: { some: { userId } } },
      ],
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      scheduledStart: true,
      dueDate: true,
      projectId: true,
      completedAt: true,
    },
  });

  const shift = (d: Date | null) => (d ? toZonedTime(d, tz) : null);
  const partition = partitionActions(
    actions.map((a) => ({
      ...a,
      scheduledStart: shift(a.scheduledStart),
      dueDate: shift(a.dueDate),
      completedAt: shift(a.completedAt),
    })),
    { today: localNow },
  );

  return {
    todaysActions: partition.todays.map((a) => ({ name: a.name })),
    overdueCount: partition.overdue.length,
  };
}

interface YesterdayRecording {
  id: string;
  title: string | null;
  meetingDate: Date;
}

/**
 * Recorded Meetings from yesterday in the summary workspace that the user can
 * see (`buildTranscriptionAccessWhere` — the same set every Meetings surface
 * shows). None when the user has no default workspace.
 */
async function loadYesterdayRecordings(
  db: PrismaClient,
  userId: string,
  workspaceId: string | null,
  window: SummaryWindow,
): Promise<YesterdayRecording[]> {
  if (!workspaceId) return [];
  const rows = await db.transcriptionSession.findMany({
    where: {
      AND: [
        buildTranscriptionAccessWhere(userId),
        { workspaceId },
        { meetingDate: { gte: window.yesterdayStart, lt: window.todayStart } },
      ],
    },
    select: { id: true, title: true, meetingDate: true },
    orderBy: { meetingDate: "asc" },
  });
  return rows.flatMap((r) =>
    r.meetingDate ? [{ id: r.id, title: r.title, meetingDate: r.meetingDate }] : [],
  );
}

/**
 * Build a user's Daily summary digest for the local day containing `now` in
 * `tz` (the notification-preference timezone that also decides when the
 * summary fires). Returns null when the user is gone.
 */
export async function buildDailySummary(
  db: PrismaClient,
  userId: string,
  now: Date,
  tz: string,
  options: BuildDailySummaryOptions = {},
): Promise<DailySummaryDigest | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, defaultWorkspaceId: true },
  });
  if (!user) return null;

  const baseUrl = summaryBaseUrl();
  const localNow = toZonedTime(now, tz);
  const window = summaryWindow(now, tz);
  const readCalendar = options.readCalendar ?? defaultCalendarReader;

  // One calendar read covering yesterday and today — each external provider
  // is queried at most once per user per build (shared Google quota).
  const [events, recordings, { todaysActions, overdueCount }] = await Promise.all([
    readCalendar(userId, window.yesterdayStart, window.tomorrowStart),
    loadYesterdayRecordings(db, userId, user.defaultWorkspaceId, window),
    loadTodaysActions(db, userId, localNow, tz),
  ]);

  const yesterdayEvents = eventsOnLocalDay(events, window.yesterdayKey, tz);
  const todayEvents = eventsOnLocalDay(events, window.todayKey, tz);

  // Attach recordings to the events they overlap; whatever no event claims is
  // appended after the calendar rows as a "recorded" line of its own.
  const recordingUrl = (id: string) => `${baseUrl}/recording/${id}`;
  const { byEvent, unmatched } = matchRecordingsToEvents(yesterdayEvents, recordings);
  const yesterday: DailySummaryYesterdayItem[] = [
    ...yesterdayEvents.map((e) => {
      const rec = byEvent.get(e);
      return {
        startLocal: e.startLocal,
        title: e.title,
        recordingUrl: rec ? recordingUrl(rec.id) : null,
        source: "calendar" as const,
      };
    }),
    ...unmatched.map((r) => ({
      startLocal: formatInTimeZone(r.meetingDate, tz, "HH:mm"),
      title: r.title?.trim() ? r.title.trim() : "Untitled meeting",
      recordingUrl: recordingUrl(r.id),
      source: "recording" as const,
    })),
  ];

  return {
    firstName: firstNameOf(user.name),
    yesterday,
    todayMeetings: todayEvents.map((e) => ({ startLocal: e.startLocal, title: e.title })),
    todaysActions,
    overdueCount,
    todayUrl: `${baseUrl}/today`,
    cycles: [],
  };
}
