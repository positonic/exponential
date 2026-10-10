import { AgentRunStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { LIVE_RUN_STATUSES } from "~/server/services/agentRuns/constants";
import { buildActionAccessWhere } from "~/server/services/access";

/**
 * The Inbox's **Delegated** tab (ADR-0067, Agent PRD D10/D11): actions handed
 * to an Assistant, each with its latest Agent run — live, waiting on the
 * owner, or finished. Scoped to runs the viewer requested or that their own
 * Assistant performed. A finished row clears by reviewing it (`reviewedAt`);
 * live rows are a signal, not a to-do, and never count in the badge.
 *
 * Same discipline as `waitingOnMe.ts`: one WHERE builder per kind, used by
 * both the count and the list so the badge and the tab can never disagree.
 */

/** Rows per group the tab renders; counts are always the full totals. */
export const DELEGATED_ROW_CAP = 20;
/** Reviewed results stay visible this long so the user can find what just cleared. */
export const REVIEWED_WINDOW_DAYS = 7;

/**
 * Runs the viewer may see on Delegated: they asked for it, or it is their
 * Assistant's — AND they can still read the action. Ownership of the run is
 * not a read grant: someone who left the workspace keeps no view of the
 * action's name, project or the Assistant's summary through this tab.
 */
export function delegatedRunsWhere(userId: string): Prisma.AgentRunWhereInput {
  return {
    AND: [
      { OR: [{ requestedById: userId }, { agent: { ownerId: userId } }] },
      { action: buildActionAccessWhere(userId) },
    ],
  };
}

/** Every status that is neither live nor waiting: a result to review. Derived, so a new status cannot vanish from the tab. */
export const TERMINAL_RUN_STATUSES: readonly AgentRunStatus[] = Object.values(AgentRunStatus).filter(
  (status) => !LIVE_RUN_STATUSES.includes(status) && status !== "WAITING_ON_OWNER",
);

export function liveDelegatedWhere(userId: string): Prisma.AgentRunWhereInput {
  return { AND: [delegatedRunsWhere(userId), { status: { in: [...LIVE_RUN_STATUSES] } }] };
}

export function waitingDelegatedWhere(userId: string): Prisma.AgentRunWhereInput {
  return { AND: [delegatedRunsWhere(userId), { status: "WAITING_ON_OWNER" }] };
}

/** Finished (any terminal status but waiting) and not yet reviewed — what the badge counts. */
export function unreviewedDelegatedWhere(userId: string): Prisma.AgentRunWhereInput {
  return {
    AND: [
      delegatedRunsWhere(userId),
      { status: { in: [...TERMINAL_RUN_STATUSES] } },
      { reviewedAt: null },
    ],
  };
}

export function reviewedDelegatedWhere(userId: string, now: Date): Prisma.AgentRunWhereInput {
  return {
    AND: [
      delegatedRunsWhere(userId),
      { reviewedAt: { gte: new Date(now.getTime() - REVIEWED_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
    ],
  };
}

export interface DelegatedCounts {
  live: number;
  waiting: number;
  unreviewed: number;
  /** Reviewed within the window — the tab's last group. */
  reviewed: number;
  /**
   * What needs the viewer on this tab: waiting + unreviewed, never live.
   * The sidebar badge adds only `unreviewed`: a waiting run is already
   * counted once through Waiting on me (assistant questions).
   */
  attention: number;
}

export async function countDelegated(db: PrismaClient, userId: string, now: Date = new Date()): Promise<DelegatedCounts> {
  const [live, waiting, unreviewed, reviewed] = await Promise.all([
    db.agentRun.count({ where: liveDelegatedWhere(userId) }),
    db.agentRun.count({ where: waitingDelegatedWhere(userId) }),
    db.agentRun.count({ where: unreviewedDelegatedWhere(userId) }),
    db.agentRun.count({ where: reviewedDelegatedWhere(userId, now) }),
  ]);
  return { live, waiting, unreviewed, reviewed, attention: waiting + unreviewed };
}

const delegatedRowSelect = {
  id: true,
  status: true,
  executor: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  lastEventAt: true,
  toolCallCount: true,
  summary: true,
  readyToClose: true,
  reviewedAt: true,
  requestedById: true,
  agent: {
    select: {
      id: true,
      name: true,
      ownerId: true,
      assistant: { select: { emoji: true } },
    },
  },
  action: {
    select: {
      id: true,
      name: true,
      status: true,
      workspace: { select: { slug: true, name: true } },
      project: { select: { name: true, workspace: { select: { slug: true, name: true } } } },
    },
  },
} satisfies Prisma.AgentRunSelect;

type DelegatedRow = Prisma.AgentRunGetPayload<{ select: typeof delegatedRowSelect }>;

function shapeRow(row: DelegatedRow, userId: string) {
  return {
    id: row.id,
    status: row.status,
    executor: row.executor,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    lastEventAt: row.lastEventAt,
    toolCallCount: row.toolCallCount,
    summary: row.summary,
    readyToClose: row.readyToClose,
    reviewedAt: row.reviewedAt,
    isOwner: row.agent.ownerId === userId,
    isRequester: row.requestedById === userId,
    agent: { id: row.agent.id, name: row.agent.name, emoji: row.agent.assistant?.emoji ?? null },
    action: {
      id: row.action.id,
      name: row.action.name,
      status: row.action.status,
      projectName: row.action.project?.name ?? null,
      workspace: row.action.workspace ?? row.action.project?.workspace ?? null,
    },
  };
}

/** The rows per group (capped) plus the full counts. Newest first in every group. */
export async function listDelegated(db: PrismaClient, userId: string, now: Date) {
  const order = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const [counts, live, waiting, unreviewed, reviewed] = await Promise.all([
    countDelegated(db, userId, now),
    db.agentRun.findMany({ where: liveDelegatedWhere(userId), orderBy: order, take: DELEGATED_ROW_CAP, select: delegatedRowSelect }),
    db.agentRun.findMany({ where: waitingDelegatedWhere(userId), orderBy: order, take: DELEGATED_ROW_CAP, select: delegatedRowSelect }),
    db.agentRun.findMany({ where: unreviewedDelegatedWhere(userId), orderBy: order, take: DELEGATED_ROW_CAP, select: delegatedRowSelect }),
    db.agentRun.findMany({ where: reviewedDelegatedWhere(userId, now), orderBy: [{ reviewedAt: "desc" }, { id: "desc" }], take: DELEGATED_ROW_CAP, select: delegatedRowSelect }),
  ]);
  return {
    counts,
    live: live.map((r) => shapeRow(r, userId)),
    waiting: waiting.map((r) => shapeRow(r, userId)),
    unreviewed: unreviewed.map((r) => shapeRow(r, userId)),
    reviewed: reviewed.map((r) => shapeRow(r, userId)),
  };
}

export type Delegated = Awaited<ReturnType<typeof listDelegated>>;
export type DelegatedRun = Delegated["live"][number];

/**
 * Review a finished run (Agent PRD D10): stamps `reviewedAt` so the row leaves
 * the badge and the Finished group, and — when the viewer chose **Mark done**
 * — completes the action **as the human**, through the same path the action
 * page and voice use (`applyActionUpdate`: access gate, activity, kanban
 * column), never as the Assistant. Only a terminal run the viewer may see on
 * Delegated can be reviewed; a live or waiting run is not a result yet.
 */
export async function reviewDelegatedRun(
  db: PrismaClient,
  input: {
    userId: string;
    runId: string;
    markDone: boolean;
    completeAction: (actionId: string, kanbanStatus: string | null) => Promise<void>;
  },
): Promise<{ reviewed: boolean; markedDone: boolean }> {
  const run = await db.agentRun.findFirst({
    where: { AND: [{ id: input.runId }, delegatedRunsWhere(input.userId)] },
    select: { id: true, status: true, reviewedAt: true, actionId: true, action: { select: { kanbanStatus: true, status: true } } },
  });
  if (!run) return { reviewed: false, markedDone: false };
  if (run.status === "QUEUED" || run.status === "RUNNING" || run.status === "WAITING_ON_OWNER") {
    throw new Error("Run is not finished");
  }

  let markedDone = false;
  if (input.markDone && run.action.status !== "COMPLETED") {
    await input.completeAction(run.actionId, run.action.kanbanStatus);
    markedDone = true;
  }

  // Guard on reviewedAt so a double click records the first reviewer only.
  const result = await db.agentRun.updateMany({
    where: { id: run.id, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedById: input.userId },
  });
  return { reviewed: result.count === 1 || run.reviewedAt !== null, markedDone };
}
