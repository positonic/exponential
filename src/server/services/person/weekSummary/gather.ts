import type { PrismaClient } from "@prisma/client";
import {
  getAggregatedActivityFeed,
  type ActivityFeedEvent,
} from "~/server/services/activity/feed";

/** Most events one summary is written from. A busier week is cut to its newest. */
export const MAX_SUMMARY_EVENTS = 200;
const PAGE_SIZE = 50;

export interface VisibleWeekEvent {
  id: string;
  createdAt: Date;
  /** The feed sentence with the actor and entity filled in. */
  sentence: string;
  /** The start of an agent run's own summary, when the event is a run. */
  detail: string | null;
  workspace: string;
}

export interface VisibleWeek {
  /** Newest first, at most {@link MAX_SUMMARY_EVENTS}. */
  events: VisibleWeekEvent[];
  /** True when the week held more visible events than the cap. */
  truncated: boolean;
}

function toVisibleEvent(event: ActivityFeedEvent, subjectName: string): VisibleWeekEvent {
  return {
    id: event.id,
    createdAt: event.createdAt,
    sentence: event.hint.template
      .replace("{actor}", event.actor?.name ?? subjectName)
      .replace("{entityRef}", event.entityRef),
    detail: event.agentRun?.summary ?? null,
    workspace: event.workspace?.name ?? "",
  };
}

/**
 * The subject's events in one week, exactly as the viewer's Person page feed
 * would list them.
 *
 * It reads through `getAggregatedActivityFeed` on purpose, with the same
 * arguments `person.getFeed` passes, rather than querying events itself. That
 * is what makes the summary inherit every visibility rule: only the viewer's
 * workspaces, no hidden event kinds, and a page event only if the viewer can
 * open the page, all checked at the moment of reading. Nothing reaches the
 * model that the viewer could not scroll to on the page below it.
 */
export async function gatherVisibleWeek(
  db: PrismaClient,
  args: {
    viewerId: string;
    subjectId: string;
    subjectName: string;
    /** Workspaces the viewer belongs to (`PersonScope.visibleWorkspaces`). */
    workspaceIds: string[];
    weekStart: Date;
    weekEnd: Date;
  },
): Promise<VisibleWeek> {
  const events: VisibleWeekEvent[] = [];
  let cursor: string | undefined;

  while (events.length < MAX_SUMMARY_EVENTS) {
    const page = await getAggregatedActivityFeed(db, {
      workspaceIds: args.workspaceIds,
      viewerId: args.viewerId,
      actorUserId: args.subjectId,
      window: { from: args.weekStart, to: args.weekEnd },
      limit: PAGE_SIZE,
      cursor,
    });
    for (const event of page.events) {
      events.push(toVisibleEvent(event, args.subjectName));
    }
    if (!page.nextCursor) return { events, truncated: false };
    cursor = page.nextCursor;
  }

  return { events: events.slice(0, MAX_SUMMARY_EVENTS), truncated: true };
}
