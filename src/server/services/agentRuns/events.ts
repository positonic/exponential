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

export interface RunnerEventInput {
  seq: number;
  kind: AgentRunEventKind;
  payload: Prisma.InputJsonValue;
}

/**
 * Append a batch of events a local runner numbered itself (Agent PRD V2). The
 * runner owns `seq` for its run, so a retried batch is idempotent: rows whose
 * seq already exists are skipped (`createMany` + `skipDuplicates` on
 * `@@unique([runId, seq])`), and `toolCallCount` grows only by the
 * `tool_call` events that were actually new. Any batch — even one that was
 * entirely a replay — is still the run's heartbeat.
 */
export async function appendRunEvents(
  db: PrismaClient,
  input: { runId: string; events: RunnerEventInput[] },
): Promise<{ inserted: number; newToolCalls: number }> {
  if (input.events.length === 0) {
    await db.agentRun.update({ where: { id: input.runId }, data: { lastEventAt: new Date() } });
    return { inserted: 0, newToolCalls: 0 };
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.agentRunEvent.findMany({
      where: { runId: input.runId, seq: { in: input.events.map((e) => e.seq) } },
      select: { seq: true },
    });
    const seen = new Set(existing.map((e) => e.seq));
    const fresh = input.events.filter((e) => !seen.has(e.seq));
    const result = fresh.length
      ? await tx.agentRunEvent.createMany({
          data: fresh.map((e) => ({ runId: input.runId, seq: e.seq, kind: e.kind, payload: e.payload })),
          skipDuplicates: true,
        })
      : { count: 0 };
    const newToolCalls = fresh.filter((e) => e.kind === "tool_call").length;
    await tx.agentRun.update({
      where: { id: input.runId },
      data: {
        lastEventAt: new Date(),
        ...(newToolCalls > 0 ? { toolCallCount: { increment: newToolCalls } } : {}),
      },
    });
    return { inserted: result.count, newToolCalls };
  });
}
