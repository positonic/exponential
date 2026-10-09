/**
 * Build one person's Shutdown recap. The data comes from the shutdown
 * routine's own section modules, run against the person's personal workspace
 * exactly as a Shutdown routine ceremony there would run them — so the recap
 * and the ceremony agenda agree by construction, and a person gets the recap
 * without having to create the ceremony.
 */
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { getSectionModule } from "~/server/services/ceremonies/agenda/sections";
import type { AgendaItem, SectionContext } from "~/server/services/ceremonies/agenda/types";
import { SHUTDOWN_ROUTINE_TEMPLATE } from "~/server/services/ceremonies/templates";
import type { CalendarReader } from "../dailySummary/calendar";
import { firstNameOf, summaryBaseUrl } from "../dailySummary/build";
import type { RecapDoneItem, RecapNumberedAction, ShutdownRecap } from "./types";

export interface BuildShutdownRecapOptions {
  /** Calendar reader for tomorrow's meetings; tests inject a fixture. */
  readCalendar?: CalendarReader;
}

/** Overdue actions shown by number; the rest collapse to a count. */
const OVERDUE_SHOWN = 5;

function absolute(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  return /^https?:\/\//.test(href) ? href : `${baseUrl}${href}`;
}

/**
 * The sections end a capped list with a text item titled "N more" ("N more
 * overdue"); its id ends in `:more` / `:more-overdue`. The recap folds those
 * into its own counts rather than printing them as items.
 */
function isMoreLine(item: AgendaItem): boolean {
  return item.refType === "text" && item.id.endsWith(":more");
}

/** The N of an "N more" line. A NaN parse (`||`, not `??`) counts as none. */
function countOf(item: AgendaItem): number {
  return Number.parseInt(item.title, 10) || 0;
}

function line(item: AgendaItem): string {
  return item.detail ? `${item.title} (${item.detail})` : item.title;
}

/**
 * The sections read only these fields of the ceremony and occurrence: its
 * zone, its owner (the person, when no participants are listed) and when it
 * starts. A recap has no ceremony row, so it stands one in with exactly
 * those fields.
 */
function recapSectionContext(
  db: PrismaClient,
  input: { userId: string; workspaceId: string; workspaceSlug: string; tz: string; now: Date; readCalendar?: CalendarReader },
): SectionContext {
  const ceremony = { id: "shutdown-recap", timezone: input.tz, ownerId: input.userId } as unknown as Ceremony;
  const occurrence = { id: "shutdown-recap", scheduledStart: input.now } as unknown as CeremonyOccurrence;
  return {
    db,
    workspaceId: input.workspaceId,
    ceremony,
    occurrence,
    previousOccurrence: null,
    participantUserIds: [input.userId],
    projectIds: [],
    now: input.now,
    workspacePath: `/w/${input.workspaceSlug}`,
    ...(input.readCalendar ? { readCalendar: input.readCalendar } : {}),
  };
}

async function runSection(ctx: SectionContext, key: string): Promise<AgendaItem[]> {
  const section = SHUTDOWN_ROUTINE_TEMPLATE.agendaTemplate.find((s) => s.key === key);
  const mod = section ? getSectionModule(section.type) : undefined;
  if (!section || !mod) return [];
  return mod.run(ctx, section);
}

/** Project, goal and key result for each finished action — what the win moved. */
async function enrichDone(db: PrismaClient, items: AgendaItem[], baseUrl: string): Promise<RecapDoneItem[]> {
  const ids = items.filter((i) => i.refType === "action").map((i) => i.refId);
  const rows = ids.length
    ? await db.action.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          project: {
            select: {
              name: true,
              goals: { select: { title: true }, take: 1 },
              keyResults: { select: { keyResult: { select: { title: true } } }, take: 1 },
            },
          },
        },
      })
    : [];
  const byId = new Map((rows ?? []).map((r) => [r.id, r.project]));
  return items
    .filter((i) => i.refType === "action")
    .map((i) => {
      const project = byId.get(i.refId) ?? null;
      return {
        actionId: i.refId,
        title: i.title,
        url: absolute(baseUrl, i.href),
        projectName: project?.name ?? null,
        goalTitle: project?.goals[0]?.title ?? null,
        keyResultTitle: project?.keyResults[0]?.keyResult.title ?? null,
      };
    });
}

export async function buildShutdownRecap(
  db: PrismaClient,
  userId: string,
  now: Date,
  tz: string,
  options: BuildShutdownRecapOptions = {},
): Promise<ShutdownRecap | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, defaultWorkspaceId: true } });
  if (!user) return null;
  // The personal workspace makes the sections read across every workspace
  // the person can access (`briefWorkspaceIds`); the default workspace is
  // the fallback for an account that somehow has none.
  const workspace =
    (await db.workspace.findFirst({ where: { type: "personal", ownerId: userId }, select: { id: true, slug: true } })) ??
    (user.defaultWorkspaceId
      ? await db.workspace.findUnique({ where: { id: user.defaultWorkspaceId }, select: { id: true, slug: true } })
      : null);
  if (!workspace) return null;

  const baseUrl = summaryBaseUrl();
  const ctx = recapSectionContext(db, {
    userId,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    tz,
    now,
    readCalendar: options.readCalendar,
  });

  const [doneItems, movedItems, timeItems, undoneItems, tomorrowItems] = await Promise.all([
    runSection(ctx, "completed_today"),
    runSection(ctx, "activity_today"),
    runSection(ctx, "time_today"),
    runSection(ctx, "left_undone"),
    runSection(ctx, "tomorrow"),
  ]);

  let n = 0;
  const numbered = (i: AgendaItem): RecapNumberedAction => ({
    n: ++n,
    actionId: i.refId,
    title: i.title,
    url: absolute(baseUrl, i.href),
    detail: i.detail ?? null,
  });

  // The section lists today's unfinished actions, then up to twenty overdue
  // ones, then a "N more overdue" line. A message to read on a phone shows
  // five overdue by number and folds the rest into the count.
  const undoneActions = undoneItems.filter((i) => i.refType === "action");
  const todays = undoneActions.filter((i) => !i.detail?.startsWith("overdue"));
  const overdue = undoneActions.filter((i) => i.detail?.startsWith("overdue"));
  const moreLine = undoneItems.find((i) => i.refType === "text" && i.id.endsWith(":more-overdue"));
  const moreOverdue = Math.max(0, overdue.length - OVERDUE_SHOWN) + (moreLine ? countOf(moreLine) : 0);
  const leftUndone = [...todays, ...overdue.slice(0, OVERDUE_SHOWN)].map(numbered);

  const shown = new Set(leftUndone.map((a) => a.actionId));
  const tomorrowActions = tomorrowItems
    .filter((i) => i.refType === "action" && !shown.has(i.refId))
    .map(numbered);

  return {
    firstName: firstNameOf(user.name),
    dayLabel: formatInTimeZone(now, tz, "EEEE d MMMM"),
    dayKey: formatInTimeZone(now, tz, "yyyy-MM-dd"),
    timezone: tz,
    done: await enrichDone(db, doneItems, baseUrl),
    moved: movedItems.filter((i) => !isMoreLine(i)).map(line),
    moreMoved: movedItems.filter(isMoreLine).reduce((sum, i) => sum + countOf(i), 0),
    time: timeItems.map(line),
    leftUndone,
    moreOverdue,
    tomorrowMeetings: tomorrowItems.filter((i) => i.refType === "text").map((i) => i.title),
    tomorrowActions,
    todayUrl: `${baseUrl}/today`,
  };
}
