import type { PrismaClient } from "@prisma/client";
import { describeEntityRef } from "../feedRenderHints";

/**
 * The deterministic, structured bundle the Weekly work digest synthesizer turns
 * into prose + content angles. Gathered in code so the LLM can only narrate what
 * is actually here — no invented accomplishments. See ADR-0018.
 *
 * v1 covers THREE sources (commits deferred — ADR-0019):
 *   1. events the user acted on   (WorkspaceActivityEvent, userId = me)
 *   2. tickets assigned to me that moved this week  (the "assigned/owned" arm)
 *   3. meetings I attended this week                (participant join)
 */
export interface WorkBundleEvent {
  action: string;
  entityType: string;
  label: string;
  workspace: string;
}

export interface WorkBundleTicket {
  title: string;
  status: string;
  workspace: string;
}

export interface WorkBundleMeeting {
  title: string;
  hasSummary: boolean;
  workspace: string;
}

export interface WorkBundle {
  events: WorkBundleEvent[];
  tickets: WorkBundleTicket[];
  meetings: WorkBundleMeeting[];
  /** Total signal count across all three sources — drives the empty-week shortcut. */
  totalSignals: number;
}

/** Per-source caps keep the prompt bounded and cost predictable. */
const MAX_EVENTS = 40;
const MAX_TICKETS = 25;
const MAX_MEETINGS = 15;

/**
 * Gather one user's week of work across the given workspaces. `workspaceIds` is
 * resolved + access-checked by the caller (the tRPC procedure), so this reader
 * does no permission work of its own — it only queries.
 *
 * An empty `workspaceIds` short-circuits to an empty bundle without touching the
 * DB (mirrors the aggregated activity reader).
 */
export async function gatherWeeklyWorkBundle(
  db: PrismaClient,
  args: {
    userId: string;
    workspaceIds: string[];
    weekStart: Date;
    weekEnd: Date;
  },
): Promise<WorkBundle> {
  if (args.workspaceIds.length === 0) {
    return { events: [], tickets: [], meetings: [], totalSignals: 0 };
  }

  const { userId, workspaceIds, weekStart, weekEnd } = args;
  const window = { gte: weekStart, lte: weekEnd };

  const [eventRows, ticketRows, meetingRows] = await Promise.all([
    // 1. Events the user acted on, across all their workspaces, this week.
    db.workspaceActivityEvent.findMany({
      where: {
        userId,
        workspaceId: { in: workspaceIds },
        createdAt: window,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
      select: {
        entityType: true,
        entityId: true,
        action: true,
        metadata: true,
        workspace: { select: { name: true } },
      },
    }),

    // 2. Tickets assigned to me that moved this week (the assigned/owned arm).
    //    Action has no updatedAt, and my own action work is already captured as
    //    source-1 events; tickets carry updatedAt and may move without my own
    //    event (a teammate progressing my ticket), which is exactly what this
    //    arm is for.
    db.ticket.findMany({
      where: {
        assigneeId: userId,
        updatedAt: window,
        product: { workspaceId: { in: workspaceIds } },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_TICKETS,
      select: {
        title: true,
        status: true,
        product: { select: { workspace: { select: { name: true } } } },
      },
    }),

    // 3. Meetings I attended this week (participant join). The one-line blurb is
    //    the meeting title; whether a summary exists is surfaced so the prompt
    //    can lean on richer meetings. (Auto-summarisation heals the corpus —
    //    ADR-0018 / the meeting-summary sweep.)
    db.transcriptionSessionParticipant.findMany({
      where: {
        userId,
        workspaceId: { in: workspaceIds },
        transcriptionSession: { createdAt: window },
      },
      orderBy: { transcriptionSession: { createdAt: "desc" } },
      take: MAX_MEETINGS,
      select: {
        workspace: { select: { name: true } },
        transcriptionSession: {
          select: { title: true, summary: true },
        },
      },
    }),
  ]);

  const events: WorkBundleEvent[] = eventRows.map((e) => ({
    action: e.action,
    entityType: e.entityType,
    label: describeEntityRef(e.entityId, e.metadata),
    workspace: e.workspace?.name ?? "Unknown workspace",
  }));

  const tickets: WorkBundleTicket[] = ticketRows.map((t) => ({
    title: t.title,
    status: t.status,
    workspace: t.product?.workspace?.name ?? "Unknown workspace",
  }));

  const meetings: WorkBundleMeeting[] = meetingRows.map((m) => ({
    title: m.transcriptionSession?.title?.trim() ?? "",
    hasSummary: Boolean(m.transcriptionSession?.summary?.trim()),
    workspace: m.workspace?.name ?? "Unknown workspace",
  }));

  return {
    events,
    tickets,
    meetings,
    totalSignals: events.length + tickets.length + meetings.length,
  };
}
