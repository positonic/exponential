import { Prisma, type PrismaClient } from "@prisma/client";
import { LIVE_RUN_STATUSES, NO_RUN_KANBAN_STATES, RUN_ELIGIBLE_AGENT_WHERE } from "./constants";

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

  // V1: only a (non-retired) Assistant's principal gets a hosted run. A plain External
  // agent (Hermes-class software, a Grok Bot, …) keeps today's contract — it
  // sees the assignment notification and picks the action up itself — so the
  // dispatcher never does the same work in parallel with it. V2's local
  // runner widens this to `executor = LOCAL_CLI` agents that claim runs.
  const agents = await db.externalAgent.findMany({
    where: { shadowUserId: { in: input.userIds }, ...RUN_ELIGIBLE_AGENT_WHERE },
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
    const run = await createRunOrCoalesce(db, {
      actionId: input.actionId,
      agentId: agent.id,
      requestedById: input.requestedById,
      executor: agent.executor,
    });
    if (run) created.push(run);
  }
  return created;
}

/**
 * Insert a run, or return null when another writer won the race: the partial
 * unique index `AgentRun_live_action_agent_key` (one live run per action and
 * agent) turns the second concurrent insert into a P2002, which is exactly the
 * coalescing the read above approximates. Any other error propagates.
 */
async function createRunOrCoalesce(
  db: Db,
  data: {
    actionId: string;
    agentId: string;
    requestedById: string | null;
    executor: "MASTRA" | "LOCAL_CLI";
    predecessorId?: string;
    wakeCommentId?: string;
  },
): Promise<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" } | null> {
  try {
    return await db.agentRun.create({ data, select: { id: true, agentId: true, executor: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
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
 * Resume on reply (Agent PRD D6, widened 2026-10-11): a comment on an action
 * whose latest run by some agent is WAITING_ON_OWNER starts a new run with
 * `predecessorId` and `wakeCommentId` when its author is **the person the run
 * asked** (whoever assigned the Action — `resolveRunQuestionRecipient`) **or
 * the agent's owner**. A bystander's comment resumes nothing: it would be
 * consumed as the answer. An agent's own comment never resumes anything (the
 * run tool does not call this), and a second reply while the resumed run is
 * live is coalesced like any other.
 *
 * The successor keeps the waiting run's requester, so the person who asked
 * for the work stays the one its next question goes to; a run nobody
 * requested takes the replier.
 *
 * Returns the runs it created (one per waiting agent the author may answer).
 */
export async function resumeWaitingRunsOnReply(
  db: Db,
  input: { actionId: string; authorId: string; commentId: string },
): Promise<Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }>> {
  // Candidate agents: those with a waiting run on this action that the author
  // was asked, or owns. Whether that run is still each agent's latest is
  // checked per agent below.
  const waiting = await db.agentRun.findMany({
    where: {
      actionId: input.actionId,
      status: "WAITING_ON_OWNER",
      agent: RUN_ELIGIBLE_AGENT_WHERE,
      OR: [{ requestedById: input.authorId }, { agent: { ownerId: input.authorId } }],
    },
    select: { agentId: true },
  });
  const agentIds = [...new Set((waiting ?? []).map((r) => r.agentId))];
  if (agentIds.length === 0) return [];

  const agents = await db.externalAgent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, ownerId: true, executor: true },
  });

  const created: Array<{ id: string; agentId: string; executor: "MASTRA" | "LOCAL_CLI" }> = [];
  for (const agent of agents) {
    const latest = await db.agentRun.findFirst({
      where: { actionId: input.actionId, agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, requestedById: true },
    });
    if (!latest || latest.status !== "WAITING_ON_OWNER") continue;
    // The latest waiting run must itself be one the author may answer.
    const asked = latest.requestedById ?? agent.ownerId;
    if (input.authorId !== asked && input.authorId !== agent.ownerId) continue;
    const run = await createRunOrCoalesce(db, {
      actionId: input.actionId,
      agentId: agent.id,
      requestedById: latest.requestedById ?? input.authorId,
      executor: agent.executor,
      predecessorId: latest.id,
      wakeCommentId: input.commentId,
    });
    if (run) created.push(run);
  }
  return created;
}
