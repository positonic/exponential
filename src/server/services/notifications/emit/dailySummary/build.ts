import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { partitionActions } from "~/lib/actions/partition";
import { ticketDisplayId } from "~/lib/fun-ids";
import { STATUS_ORDER } from "~/lib/ticket-statuses";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { currentCycleOrder, currentCycleWhere } from "~/plugins/product/server/currentCycle";
import {
  computeCyclePacing,
  computeCycleRollup,
} from "~/plugins/product/server/cycleRollup";
import { buildTranscriptionAccessWhere } from "~/server/services/access";
import { TimeEntryService } from "~/server/services/timeEntry/TimeEntryService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import {
  eventsOnLocalDay,
  summaryWindow,
  type CalendarReader,
  type SummaryWindow,
} from "./calendar";
import { matchRecordingsToEvents } from "./matcher";
import type {
  DailySummaryActionItem,
  DailySummaryCycle,
  DailySummaryDigest,
  DailySummaryTime,
  DailySummaryYesterdayItem,
} from "./types";

/** In-flight = started but not finished: the cycle block's "your tickets" list. */
const IN_FLIGHT_STATUSES = new Set(["IN_PROGRESS", "BLOCKED", "QA"]);
/**
 * Up next = committed to the cycle but not started (the complement of
 * in-flight, so the two lists never overlap). Cycle tickets still in the
 * refinement statuses appear in neither list — only as a one-line count.
 */
const UP_NEXT_STATUS = "COMMITTED";
const UNREFINED_STATUSES = new Set(["BACKLOG", "NEEDS_REFINEMENT", "READY_TO_PLAN"]);

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

interface CycleScope {
  workspaceId: string;
  workspaceSlug: string;
}

/**
 * One condensed cycle block per product in the summary workspace where the
 * user holds tickets, in product-name order. The current cycle per product is
 * chosen exactly as `product.getOverview` does (this product's own cycle or one
 * holding its tickets, else a legacy workspace-shared cycle — never another
 * product's) and its numbers come from the same `computeCycleRollup` /
 * `computeCyclePacing` the product page renders, so the two cannot disagree.
 * A product with no current cycle contributes no block.
 */
async function loadCycleBlocks(
  db: PrismaClient,
  userId: string,
  scope: CycleScope,
  now: Date,
  tz: string,
  baseUrl: string,
): Promise<DailySummaryCycle[]> {
  const products = await db.product.findMany({
    where: {
      workspaceId: scope.workspaceId,
      tickets: { some: { assigneeId: userId } },
    },
    select: { id: true, name: true, slug: true, funTicketIds: true },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) return [];

  const cycleWhere = currentCycleWhere(scope.workspaceId, now);
  const cycleSelect = {
    id: true,
    name: true,
    status: true,
    startDate: true,
    endDate: true,
  };
  const productBase = (slug: string) =>
    `${baseUrl}/w/${scope.workspaceSlug}/products/${slug}`;
  const statusRank = (s: string) => STATUS_ORDER[s] ?? 99;

  // The products are independent, so their cycle + ticket reads run together;
  // product-name order is preserved by Promise.all.
  const loadBlock = async (
    product: (typeof products)[number],
  ): Promise<DailySummaryCycle | null> => {
    const own = await db.list.findFirst({
      where: {
        AND: [
          cycleWhere,
          {
            OR: [
              { productId: product.id },
              { tickets: { some: { productId: product.id } } },
            ],
          },
        ],
      },
      orderBy: currentCycleOrder,
      select: cycleSelect,
    });
    const cycle =
      own ??
      (await db.list.findFirst({
        where: { ...cycleWhere, productId: null },
        orderBy: currentCycleOrder,
        select: cycleSelect,
      }));
    if (!cycle) return null;

    // One ticket query per product: the whole cycle for the rollup, the
    // user's rows filtered from it for the in-flight list.
    const cycleTickets = await db.ticket.findMany({
      where: { productId: product.id, cycleId: cycle.id },
      select: {
        id: true,
        shortId: true,
        number: true,
        title: true,
        status: true,
        points: true,
        assigneeId: true,
        updatedAt: true,
      },
    });

    const rollup = computeCycleRollup(cycle, cycleTickets, { userId });
    const pacing = computeCyclePacing(rollup, now);
    const mine = cycleTickets.filter((t) => t.assigneeId === userId);
    const label = (t: (typeof cycleTickets)[number]) =>
      `${ticketDisplayId(product, t)} ${t.title}`;
    const ticketUrl = (t: { id: string }) =>
      `${productBase(product.slug)}/tickets/${t.id}`;

    return {
      productName: product.name,
      name: cycle.name,
      range:
        cycle.startDate && cycle.endDate
          ? `${formatInTimeZone(cycle.startDate, tz, "d MMM")} – ${formatInTimeZone(cycle.endDate, tz, "d MMM")}`
          : null,
      daysLeft: pacing.daysLeft,
      completed: rollup.completed,
      committed: rollup.committed,
      unit: rollup.usesPoints ? "pts" : "tickets",
      elapsedPct: pacing.timePct !== null ? Math.round(pacing.timePct) : null,
      pace: pacing.pace,
      cycleUrl: `${productBase(product.slug)}/cycles/${cycle.id}`,
      inFlight: mine
        .filter((t) => IN_FLIGHT_STATUSES.has(t.status))
        .sort((a, b) => statusRank(a.status) - statusRank(b.status))
        .map((t) => ({ label: label(t), status: t.status, url: ticketUrl(t) })),
      upNext: mine
        .filter((t) => t.status === UP_NEXT_STATUS)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((t) => ({ label: label(t), url: ticketUrl(t) })),
      unrefinedCount: mine.filter((t) => UNREFINED_STATUSES.has(t.status)).length,
    };
  };

  const blocks = await Promise.all(products.map(loadBlock));
  return blocks.filter((b): b is DailySummaryCycle => b !== null);
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
      context: { userId, workspaceId },
    });
    return undefined;
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
  const [events, recordings, { todaysActions, overdueCount }, cycles, time] = await Promise.all([
    readCalendarSafely,
    loadYesterdayRecordings(db, userId, scope?.workspaceId ?? null, window),
    loadTodaysActions(db, userId, localNow, tz),
    scope ? loadCycleBlocks(db, userId, scope, now, tz, baseUrl) : Promise.resolve([]),
    loadYesterdayTime(db, userId, scope?.workspaceId ?? null, window, baseUrl),
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
    overdueCount,
    todayUrl: `${baseUrl}/today`,
    cycles,
  };
}
