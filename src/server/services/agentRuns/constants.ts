import type { AgentRunStatus } from "@prisma/client";

/** Runs that are still going: the title spinner, the pill's "Working", the 2 s poll. */
export const LIVE_RUN_STATUSES: readonly AgentRunStatus[] = ["QUEUED", "RUNNING"];

export function isLiveRunStatus(status: AgentRunStatus): boolean {
  return LIVE_RUN_STATUSES.includes(status);
}

/** Kanban states in which assigning an Assistant starts nothing (Agent PRD D3). */
export const NO_RUN_KANBAN_STATES: readonly string[] = ["BACKLOG", "DONE"];

/** A RUNNING row with no heartbeat for this long is timed out by the cron sweep (D4). */
export const RUN_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

/** A QUEUED row older than this is picked up by the cron sweep even if `after()` never fired. */
export const QUEUED_RETRY_AFTER_MS = 60 * 1000;

/**
 * A LOCAL_CLI run still QUEUED this long after creation is "waiting for a
 * runner" (Agent PRD V2): nobody on the owner's machine has claimed it. A
 * presentation state, not a status — the row stays QUEUED and claimable.
 */
export const WAITING_FOR_RUNNER_AFTER_MS = 10 * 60 * 1000;
