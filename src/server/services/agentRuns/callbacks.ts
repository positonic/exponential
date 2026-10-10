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
