/**
 * The self-host scheduler's plan: `vercel.json`'s `crons`, read as-is.
 *
 * `vercel.json` is the single source of the schedule — Vercel Cron reads it on
 * exponential.im, and the self-host scheduler reads the same entries off
 * Vercel (ADR: self-host scheduler is an HTTP clock over vercel.json). Nothing
 * here may import from `src/`: the scheduler ships in a small image with only
 * `vercel.json`, these two files and `node-cron`.
 */

export interface CronEntry {
  /** Route path, e.g. `/api/cron/agent-runs`. */
  path: string;
  /** Five-field cron expression, interpreted in UTC as Vercel does. */
  schedule: string;
}

/** Read the `crons` entries out of a parsed `vercel.json`. */
export function readCronPlan(vercelJson: unknown): CronEntry[] {
  const crons = (vercelJson as { crons?: unknown }).crons;
  if (!Array.isArray(crons)) return [];
  return crons.map((entry: { path: string; schedule: string }) => ({
    path: entry.path,
    schedule: entry.schedule,
  }));
}
