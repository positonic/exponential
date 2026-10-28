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
import { type CronEntry, readCronPlan } from "./cronPlan";

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
 * app, one log line for its outcome. A tick never rejects — a failed, non-2xx
 * or timed-out call is logged and the next tick runs as usual.
 *
 * A tick for a path whose previous call hasn't returned is skipped, so a slow
 * route never stacks up concurrent runs of itself (agent-runs fires every
 * minute and can wait up to 270 s on Mastra). Other paths are unaffected. This
 * is our own guard rather than node-cron's `noOverlap`, so tests can drive it.
 */
export function createTick(config: SchedulerConfig, deps: TickDeps) {
  const inFlight = new Set<string>();

  return async function tick(cronPath: string): Promise<void> {
    if (inFlight.has(cronPath)) {
      deps.log(`[scheduler] GET ${cronPath} skipped (previous call still running)`);
      return;
    }
    inFlight.add(cronPath);
    const startedAt = Date.now();
    try {
      const response = await deps.fetch(`${config.targetUrl}${cronPath}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.cronSecret}` },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      // The routes answer with a small JSON summary nobody reads; release the
      // connection rather than leave the body unconsumed.
      await response.body?.cancel();
      deps.log(`[scheduler] GET ${cronPath} → ${response.status} in ${Date.now() - startedAt}ms`);
    } catch (error) {
      deps.log(`[scheduler] GET ${cronPath} ${describeFailure(error, config.timeoutMs)}`);
    } finally {
      inFlight.delete(cronPath);
    }
  };
}

function describeFailure(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return `timed out after ${timeoutMs}ms`;
  }
  if (!(error instanceof Error)) return `failed: ${String(error)}`;
  // Node's fetch reports every network failure as "fetch failed"; the cause
  // (ECONNREFUSED, ENOTFOUND, …) is what tells an operator what went wrong.
  const cause = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof cause === "string" ? `failed: ${error.message} (${cause})` : `failed: ${error.message}`;
}

const DEFAULT_TARGET_URL = "http://localhost:3000";
/**
 * 300 s is the largest `maxDuration` among the cron routes, and must stay at or
 * above the 270 s Mastra call ceiling agent-runs waits on. `next start` doesn't
 * enforce `maxDuration`, so this is the only bound on a stuck call.
 */
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Start-up checks, all fail-closed: a missing `CRON_SECRET` would make every
 * call a 401/503, and a garbled URL or timeout would make every tick fail, so
 * none of them is worth starting for.
 */
function readSchedulerConfig(env: NodeJS.ProcessEnv): SchedulerConfig {
  // Templates often set a variable to "" rather than leave it out; treat that as unset.
  const setting = (name: string) => {
    const value = env[name]?.trim();
    return value === "" ? undefined : value;
  };

  const cronSecret = setting("CRON_SECRET");
  if (!cronSecret) {
    throw new Error("CRON_SECRET is not set; set it to the same value the app uses");
  }

  const targetUrl = (setting("SCHEDULER_TARGET_URL") ?? DEFAULT_TARGET_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]/.test(targetUrl) || !URL.canParse(targetUrl)) {
    throw new Error(`SCHEDULER_TARGET_URL is not an http(s) URL: ${JSON.stringify(targetUrl)}`);
  }

  const timeoutMs = Number(setting("SCHEDULER_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("SCHEDULER_TIMEOUT_MS must be a positive whole number of milliseconds");
  }

  return { targetUrl, cronSecret, timeoutMs };
}

function main(): void {
  let plan: CronEntry[];
  let config: SchedulerConfig;
  try {
    config = readSchedulerConfig(process.env);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const vercelJsonPath = path.resolve(here, "../../vercel.json");
    plan = readCronPlan(JSON.parse(readFileSync(vercelJsonPath, "utf8")));
  } catch (error) {
    // One readable line, then exit 1 — never run a partial plan or a plan
    // that can only fail.
    console.error(`[scheduler] not starting: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const log = (line: string) => console.log(line);
  // A stray rejection must never take the clock down with it.
  process.on("unhandledRejection", (reason) => {
    log(`[scheduler] unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
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
