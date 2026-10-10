import type { Prisma, PrismaClient } from "@prisma/client";
import { LIVE_RUN_STATUSES } from "~/server/services/agentRuns/constants";

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

/** Runs the viewer may see on Delegated: they asked for it, or it is their Assistant's. */
export function delegatedRunsWhere(userId: string): Prisma.AgentRunWhereInput {
  return {
    OR: [{ requestedById: userId }, { agent: { ownerId: userId } }],
  };
}

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
      { status: { in: ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"] } },
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
  /** What the sidebar badge adds: waiting + unreviewed, never live. */
  attention: number;
}

export async function countDelegated(db: PrismaClient, userId: string): Promise<DelegatedCounts> {
  const [live, waiting, unreviewed] = await Promise.all([
    db.agentRun.count({ where: liveDelegatedWhere(userId) }),
    db.agentRun.count({ where: waitingDelegatedWhere(userId) }),
    db.agentRun.count({ where: unreviewedDelegatedWhere(userId) }),
  ]);
  return { live, waiting, unreviewed, attention: waiting + unreviewed };
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
    countDelegated(db, userId),
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
