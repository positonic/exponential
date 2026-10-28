/**
 * Self-host scheduler — an HTTP clock over `vercel.json`'s `crons`.
 *
 * Off Vercel nothing calls the cron routes, so a self-hosted install runs this
 * process next to the app. It registers every `vercel.json` cron with
 * node-cron in UTC and, on each tick, makes the request Vercel Cron would:
 * `GET ${SCHEDULER_TARGET_URL}${path}` with `Authorization: Bearer ${CRON_SECRET}`.
 * It runs no business logic; the routes do the work and the auth.
 *
 * exponential.im keeps Vercel Cron — this is never deployed there.
 *
 *   CRON_SECRET=… SCHEDULER_TARGET_URL=http://localhost:3000 npm run scheduler:selfhost
 *
 * Imports only Node builtins and node-cron (nothing from `src/`), so the
 * scheduler image needs no Next build.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import cron from "node-cron";
import { readCronPlan } from "./cronPlan";

export interface SchedulerConfig {
  /** Base URL of the app, e.g. `http://localhost:3000`. */
  targetUrl: string;
  cronSecret: string;
  timeoutMs: number;
}

export interface TickDeps {
  fetch: typeof globalThis.fetch;
  log: (line: string) => void;
}

/**
 * Build the function each scheduled entry fires: one authenticated GET to the
 * app, one log line for its outcome.
 */
export function createTick(config: SchedulerConfig, deps: TickDeps) {
  return async function tick(cronPath: string): Promise<void> {
    const startedAt = Date.now();
    const response = await deps.fetch(`${config.targetUrl}${cronPath}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.cronSecret}` },
    });
    // The routes answer with a small JSON summary nobody reads; release the
    // connection rather than leave the body unconsumed.
    await response.body?.cancel();
    deps.log(`[scheduler] GET ${cronPath} → ${response.status} in ${Date.now() - startedAt}ms`);
  };
}

const DEFAULT_TARGET_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 300_000;

function main(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const vercelJsonPath = path.resolve(here, "../../vercel.json");
  const plan = readCronPlan(JSON.parse(readFileSync(vercelJsonPath, "utf8")));

  const config: SchedulerConfig = {
    targetUrl: (process.env.SCHEDULER_TARGET_URL ?? DEFAULT_TARGET_URL).replace(/\/+$/, ""),
    cronSecret: process.env.CRON_SECRET ?? "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const log = (line: string) => console.log(line);
  const tick = createTick(config, { fetch: globalThis.fetch, log });

  for (const entry of plan) {
    cron.schedule(entry.schedule, () => tick(entry.path), { timezone: "UTC" });
  }
  log(`[scheduler] ${plan.length} crons scheduled from vercel.json (UTC) → ${config.targetUrl}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main();
}
