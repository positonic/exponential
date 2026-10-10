import type { Prisma, PrismaClient } from "@prisma/client";
import { LIVE_RUN_STATUSES, NO_RUN_KANBAN_STATES } from "./constants";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Assignment starts an Agent run (ADR-0067, Agent PRD D3). Called from every
 * assignment path (`action.assign`, `bulkAssign`, the run tool `reassign-action`)
 * so the rule cannot drift between them:
 *
 *  - only assignees that are agent principals (shadow users of an External
 *    agent) get a run; humans never do;
 *  - an action parked in BACKLOG or already DONE/completed starts nothing;
 *  - at most one live run per (action, agent) — re-assigning while live is a
 *    no-op (coalescing), so a double click cannot start two.
 *
 * Returns the runs it created. The caller decides how to kick the dispatcher
 * (`after()` from a request, nothing from a cron).
 */
export async function enqueueAgentRunsForAssignees(
  db: Db,
  input: { actionId: string; userIds: string[]; requestedById: string | null },
): Promise<Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }>> {
  if (input.userIds.length === 0) return [];

  // V1: only an Assistant's principal gets a hosted run. A plain External
  // agent (Hermes-class software, a Grok Bot, …) keeps today's contract — it
  // sees the assignment notification and picks the action up itself — so the
  // dispatcher never does the same work in parallel with it. V2's local
  // runner widens this to `executor = LOCAL_CLI` agents that claim runs.
  const agents = await db.externalAgent.findMany({
    where: { shadowUserId: { in: input.userIds }, assistant: { isNot: null } },
    select: { id: true, executor: true },
  });
  if (agents.length === 0) return [];

  const action = await db.action.findUnique({
    where: { id: input.actionId },
    select: { status: true, kanbanStatus: true },
  });
  if (!action) return [];
  if (action.status === "COMPLETED" || action.status === "CANCELLED") return [];
  if (action.kanbanStatus && NO_RUN_KANBAN_STATES.includes(action.kanbanStatus)) return [];

  const live = await db.agentRun.findMany({
    where: {
      actionId: input.actionId,
      agentId: { in: agents.map((a) => a.id) },
      status: { in: [...LIVE_RUN_STATUSES] },
    },
    select: { agentId: true },
  });
  const busy = new Set(live.map((r) => r.agentId));

  const created: Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }> = [];
  for (const agent of agents) {
    if (busy.has(agent.id)) continue;
    const run = await db.agentRun.create({
      data: {
        actionId: input.actionId,
        agentId: agent.id,
        requestedById: input.requestedById,
        executor: agent.executor,
      },
      select: { id: true, agentId: true, executor: true },
    });
    created.push(run);
  }
  return created;
}

/**
 * Unassigning an agent cancels its QUEUED run and leaves a RUNNING one to
 * finish (D3). Returns the number of runs cancelled.
 */
export async function cancelQueuedRunsForUnassigned(
  db: Db,
  input: { actionId: string; userIds: string[] },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const agents = await db.externalAgent.findMany({
    where: { shadowUserId: { in: input.userIds } },
    select: { id: true },
  });
  if (agents.length === 0) return 0;
  const result = await db.agentRun.updateMany({
    where: {
      actionId: input.actionId,
      agentId: { in: agents.map((a) => a.id) },
      status: "QUEUED",
    },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  return result.count;
}

/**
 * Resume on owner reply (Agent PRD D6): the owner of an External agent comments
 * on an action whose latest run by that agent is WAITING_ON_OWNER → a new run
 * with `predecessorId` and `wakeCommentId`, requested by the owner. An agent's
 * own comment never resumes anything (the run tool does not call this), and a
 * second reply while the resumed run is live is coalesced like any other.
 * Returns the runs it created (one per waiting agent of the author).
 */
export async function resumeWaitingRunsOnOwnerReply(
  db: Db,
  input: { actionId: string; authorId: string; commentId: string },
): Promise<Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }>> {
  const agents = await db.externalAgent.findMany({
    where: { ownerId: input.authorId, assistant: { isNot: null } },
    select: { id: true, executor: true },
  });
  if (!agents?.length) return [];

  const created: Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }> = [];
  for (const agent of agents) {
    const latest = await db.agentRun.findFirst({
      where: { actionId: input.actionId, agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!latest || latest.status !== "WAITING_ON_OWNER") continue;
    const run = await db.agentRun.create({
      data: {
        actionId: input.actionId,
        agentId: agent.id,
        requestedById: input.authorId,
        executor: agent.executor,
        predecessorId: latest.id,
        wakeCommentId: input.commentId,
      },
      select: { id: true, agentId: true, executor: true },
    });
    created.push(run);
  }
  return created;
}
