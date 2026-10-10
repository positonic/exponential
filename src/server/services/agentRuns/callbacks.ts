import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

/**
 * The run a `mastra.*` callback acts for (ADR-0067, Agent PRD D5). Resolved
 * from the JWT claim the dispatcher minted — never from tool input — and
 * checked to belong to the calling principal and to still be live.
 */
export async function requireLiveRunForCaller(
  db: PrismaClient,
  ctx: { agentRunId?: string; tokenType?: string; userId: string },
) {
  if (ctx.tokenType !== "agent-context" || !ctx.agentRunId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Run tools require a run token" });
  }
  const run = await db.agentRun.findFirst({
    where: { id: ctx.agentRunId, agent: { shadowUserId: ctx.userId } },
    select: {
      id: true,
      status: true,
      actionId: true,
      toolCallCount: true,
      agent: { select: { id: true, ownerId: true, shadowUserId: true } },
    },
  });
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
  }
  if (run.status !== "RUNNING") {
    // A cancelled or finished run keeps nothing a late callback sends.
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Run is ${run.status}` });
  }
  return run;
}

/**
 * The External agent a local runner acts for (Agent PRD V2, D2): the caller
 * must have authenticated with an `exp_agent_` key, so the session user is the
 * agent's shadow user. A web session or an `agent-context` run token is
 * refused — the runner surface is for the owner's own machine only.
 */
export async function requireAgentKeyPrincipal(
  db: PrismaClient,
  ctx: { tokenType?: string; userId: string },
) {
  if (ctx.tokenType !== "agent-key") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Runner procedures require an agent key" });
  }
  const agent = await db.externalAgent.findUnique({
    where: { shadowUserId: ctx.userId },
    select: { id: true, ownerId: true, shadowUserId: true, executor: true },
  });
  if (!agent) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
  }
  return agent;
}

/**
 * The run a runner's `heartbeat` / `appendEvents` / `finish` acts on. Resolved
 * through the caller's own agent — a `runId` alone is never trusted — and
 * must still be RUNNING and claimed by this runner (or by nobody, for a row
 * the hosted dispatcher never stamps).
 */
export async function requireClaimedRunForRunner(
  db: PrismaClient,
  input: { agentId: string; runId: string; runnerId?: string },
) {
  const run = await db.agentRun.findFirst({
    where: { id: input.runId, agentId: input.agentId },
    select: { id: true, status: true, actionId: true, claimedBy: true, toolCallCount: true },
  });
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
  }
  if (run.status !== "RUNNING") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Run is ${run.status}` });
  }
  if (input.runnerId && run.claimedBy && run.claimedBy !== input.runnerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Run is claimed by another runner" });
  }
  return run;
}
