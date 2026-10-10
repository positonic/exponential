import type { Prisma } from "@prisma/client";
import { LIVE_RUN_STATUSES } from "./constants";

/**
 * The live run an action list or detail query carries so the title can show
 * a spinner in place of its status dot (ADR-0067, Agent PRD D2/D11). Derived
 * per request from the live set — there is no `Action.activeRunId` column —
 * and covered by `@@index([actionId, createdAt])`.
 */
export const activeRunInclude = {
  agentRuns: {
    where: { status: { in: [...LIVE_RUN_STATUSES] } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      startedAt: true,
      toolCallCount: true,
      agentId: true,
      agent: { select: { name: true } },
    },
  },
} satisfies Prisma.ActionInclude;

export interface ActiveRunSummary {
  id: string;
  status: string;
  startedAt: Date | null;
  toolCallCount: number;
  agentId: string;
  agent: { name: string };
}

/** `agentRuns` (the live set, at most one) → `activeRun` on the row. */
export function withActiveRun<T extends { agentRuns?: ActiveRunSummary[] }>(
  row: T,
): T & { activeRun: ActiveRunSummary | null } {
  return { ...row, activeRun: row.agentRuns?.[0] ?? null };
}
