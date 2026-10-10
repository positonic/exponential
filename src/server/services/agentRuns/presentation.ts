import type { AgentExecutor, AgentRunStatus } from "@prisma/client";
import { WAITING_FOR_RUNNER_AFTER_MS } from "./constants";

/**
 * Derived, read-side states of a run that are not statuses (Agent PRD V2).
 * Pure functions over the row so the pill, the Delegated tab and any future
 * surface agree without a column or a cron.
 */

export interface WaitingForRunnerInput {
  status: AgentRunStatus;
  executor: AgentExecutor;
  createdAt: Date;
}

/**
 * A `LOCAL_CLI` run still `QUEUED` ten minutes after it was created is waiting
 * for a runner: the owner's machine is not polling, or its key was revoked.
 * The row is still live and still claimable — nothing times it out, the
 * hosted dispatcher never touches it, and the next `agentRun.claim` picks it
 * up — so this is a hint to the owner, rendered without a spinner.
 */
export function isWaitingForRunner(run: WaitingForRunnerInput, now: Date = new Date()): boolean {
  if (run.status !== "QUEUED" || run.executor !== "LOCAL_CLI") return false;
  return now.getTime() - run.createdAt.getTime() >= WAITING_FOR_RUNNER_AFTER_MS;
}
