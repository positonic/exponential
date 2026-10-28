/**
 * The self-host scheduler's plan: `vercel.json`'s `crons`, validated whole.
 *
 * `vercel.json` is the single source of the schedule — Vercel Cron reads it on
 * exponential.im, and the self-host scheduler reads the same entries off
 * Vercel (ADR-0077). Nothing here may import from `src/`: the scheduler ships
 * in a small image with only `vercel.json`, these two files and `node-cron`.
 */

import cron from "node-cron";

export interface CronEntry {
  /** Route path, e.g. `/api/cron/agent-runs`. */
  path: string;
  /** Five-field cron expression, interpreted in UTC as Vercel does. */
  schedule: string;
}

const CRON_PATH_PREFIX = "/api/cron/";

/** The plan is unusable; `problems` names every bad entry, one line each. */
export class InvalidCronPlanError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid cron plan: ${problems.join("; ")}`);
    this.name = "InvalidCronPlanError";
  }
}

/**
 * Read and validate the `crons` entries of a parsed `vercel.json`.
 *
 * All or nothing: if any entry has a path outside `/api/cron/` or a schedule
 * node-cron rejects, this throws `InvalidCronPlanError` listing every problem.
 * The scheduler never runs a partial plan — a silently dropped entry is a job
 * that quietly stops running, which is the failure this scheduler exists to
 * prevent.
 */
export function readCronPlan(vercelJson: unknown): CronEntry[] {
  const crons = (vercelJson as { crons?: unknown } | null)?.crons;
  if (!Array.isArray(crons) || crons.length === 0) {
    throw new InvalidCronPlanError(["vercel.json has no crons"]);
  }

  const problems: string[] = [];
  const plan = crons.map((raw: unknown, index): CronEntry => {
    const entry = (raw ?? {}) as { path?: unknown; schedule?: unknown };
    const path = typeof entry.path === "string" ? entry.path : "";
    const schedule = typeof entry.schedule === "string" ? entry.schedule : "";
    const label = path || `crons[${index}]`;

    if (!path.startsWith(CRON_PATH_PREFIX)) {
      problems.push(`${label}: path must start with "${CRON_PATH_PREFIX}"`);
    }
    if (!cron.validate(schedule)) {
      problems.push(`${label}: invalid schedule ${JSON.stringify(entry.schedule ?? null)}`);
    }
    return { path, schedule };
  });

  if (problems.length > 0) throw new InvalidCronPlanError(problems);
  return plan;
}
