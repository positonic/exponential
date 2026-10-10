import type { Prisma, PrismaClient } from "@prisma/client";

export type AgentRunEventKind = "status" | "tool_call" | "tool_result" | "text" | "log" | "error";

/**
 * Append one event to a run's log (ADR-0067, Agent PRD D5): `seq` is
 * monotonic per run — the next after the current max, assigned inside a
 * transaction so two callbacks racing cannot collide on
 * `@@unique([runId, seq])`. Every append is the run's heartbeat
 * (`lastEventAt`), and a `tool_call` bumps `toolCallCount`, which is what the
 * pill shows live.
 */
export async function appendRunEvent(
  db: PrismaClient,
  input: { runId: string; kind: AgentRunEventKind; payload: Prisma.InputJsonValue },
): Promise<{ id: string; seq: number }> {
  return db.$transaction(async (tx) => {
    const last = await tx.agentRunEvent.aggregate({
      where: { runId: input.runId },
      _max: { seq: true },
    });
    const seq = (last._max.seq ?? 0) + 1;
    const event = await tx.agentRunEvent.create({
      data: { runId: input.runId, seq, kind: input.kind, payload: input.payload },
      select: { id: true, seq: true },
    });
    await tx.agentRun.update({
      where: { id: input.runId },
      data: {
        lastEventAt: new Date(),
        ...(input.kind === "tool_call" ? { toolCallCount: { increment: 1 } } : {}),
      },
    });
    return event;
  });
}
