import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildTranscriptionAccessWhere } from "~/server/services/access";
import {
  describeDriProject,
  driProjectPath,
  loadDriProjectStates,
} from "~/server/services/projects/driProjects";
import { TimeEntryService } from "~/server/services/timeEntry/TimeEntryService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import {
  eventsOnLocalDay,
  summaryWindow,
  type CalendarReader,
  type SummaryWindow,
} from "./calendar";
import { actionNameMarkdown } from "./actionName";
import { matchRecordingsToEvents } from "./matcher";
import { loadCycleBlocks, partitionOwnedActions, type CycleScope } from "./loaders";
import type {
  DailySummaryActionItem,
  DailySummaryDigest,
  DailySummaryDriProject,
  DailySummaryTime,
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
  const configured = process.env.NEXTAUTH_URL?.trim().replace(/\/+$/, "");
  return configured && configured.length > 0 ? configured : getPublicBaseUrlFromEnv();
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

async function loadTodaysActions(
  db: PrismaClient,
  userId: string,
  localNow: Date,
  tz: string,
): Promise<{
  todaysActions: DailySummaryActionItem[];
  overdueActions: DailySummaryActionItem[];
  overdueCount: number;
}> {
  const partition = await partitionOwnedActions(db, userId, localNow, tz);
  return {
    todaysActions: partition.todays.map((a) => ({ name: actionNameMarkdown(a.name) })),
    overdueActions: partition.overdue.map((a) => ({ name: actionNameMarkdown(a.name) })),
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
 * Yesterday's time for the Yesterday line: the same `dayReport` the `/time`
 * Day tab renders (ADR-0059 — one builder, two renderers), scoped to the
 * summary workspace when there is one. A failing report degrades to the
 * empty state rather than costing the user the digest.
 */
async function loadYesterdayTime(
  db: PrismaClient,
  userId: string,
  workspaceId: string | null,
  window: SummaryWindow,
  baseUrl: string,
): Promise<DailySummaryTime | undefined> {
  try {
    const report = await new TimeEntryService(db).dayReport({
      userId,
      dayStart: window.yesterdayStart,
      dayEnd: window.todayStart,
      workspaceId,
    });
    return {
      attentionMinutes: report.attentionMinutes,
      proposedCount: report.proposedCount,
      topProducts: report.byProduct
        .filter((p) => p.minutes > 0)
        .slice(0, 3)
        .map((p) => ({ name: p.name, minutes: p.minutes })),
      dayUrl: `${baseUrl}/time`,
    };
  } catch (error) {
    reportHandledErrorServer(error, {
      area: "daily-summary-time",
      context: { userId, workspaceId: workspaceId ?? "none" },
    });
    return undefined;
  }
}

/**
 * The projects the user is DRI for, across every workspace (the digest is
 * cross-workspace like Today's actions), as one line of state each. A
 * failing read degrades to the empty state rather than costing the digest.
 */
async function loadDriProjects(
  db: PrismaClient,
  userId: string,
  now: Date,
  baseUrl: string,
): Promise<DailySummaryDriProject[]> {
  try {
    const states = await loadDriProjectStates(db, userId, { now });
    return states.map((p) => {
      const path = driProjectPath(p);
      return {
        name: p.name,
        state: describeDriProject(p, now),
        needsAttention: p.needsAttention,
        url: path ? `${baseUrl}${path}` : null,
      };
    });
  } catch (error) {
    reportHandledErrorServer(error, {
      area: "daily-summary-dri-projects",
      context: { userId },
    });
    return [];
  }
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
  // The summary workspace is the user's default workspace (ADR-0059) — no
  // separate preference. Without one (or if it no longer exists), the cycle
  // and Up next sections render their empty states and everything else still
  // builds. `defaultWorkspaceId` is a bare id on User, hence the lookup.
  const workspace = user.defaultWorkspaceId
    ? await db.workspace.findUnique({
        where: { id: user.defaultWorkspaceId },
        select: { id: true, slug: true },
      })
    : null;
  const scope: CycleScope | null = workspace
    ? { workspaceId: workspace.id, workspaceSlug: workspace.slug }
    : null;

  const baseUrl = summaryBaseUrl();
  const localNow = toZonedTime(now, tz);
  const window = summaryWindow(now, tz);
  const readCalendar = options.readCalendar ?? defaultCalendarReader;

  // One calendar read covering yesterday and today — each external provider
  // is queried at most once per user per build (shared Google quota). A
  // failing reader (expired token, provider outage) degrades the two meeting
  // sections to their empty states rather than costing the user the whole
  // digest; the failure is still reported so it can be found.
  const readCalendarSafely = readCalendar(
    userId,
    window.yesterdayStart,
    window.tomorrowStart,
  ).catch((error: unknown) => {
    reportHandledErrorServer(error, {
      area: "daily-summary-calendar",
      context: { userId, tz },
    });
    return [];
  });
  const [
    events,
    recordings,
    { todaysActions, overdueActions, overdueCount },
    cycles,
    time,
    driProjects,
  ] = await Promise.all([
    readCalendarSafely,
    loadYesterdayRecordings(db, userId, scope?.workspaceId ?? null, window),
    loadTodaysActions(db, userId, localNow, tz),
    scope ? loadCycleBlocks(db, userId, scope, now, tz, baseUrl) : Promise.resolve([]),
    loadYesterdayTime(db, userId, scope?.workspaceId ?? null, window, baseUrl),
    loadDriProjects(db, userId, now, baseUrl),
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
    time,
    todayMeetings: todayEvents.map((e) => ({ startLocal: e.startLocal, title: e.title })),
    todaysActions,
    overdueActions,
    overdueCount,
    todayUrl: `${baseUrl}/today`,
    cycles,
    driProjects,
  };
}
