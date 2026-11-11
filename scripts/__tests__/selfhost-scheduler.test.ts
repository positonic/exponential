// @vitest-environment node
/**
 * The self-host scheduler is an HTTP clock over `vercel.json`'s `crons`
 * (ADR-0077). These tests drive it through its two public seams — the plan it
 * reads and the tick it fires — with an injected fake `fetch`, and assert what
 * an operator sees: which HTTP calls go out, and which line lands in the log.
 *
 * The cron routes themselves are covered by `src/app/api/cron/__tests__/*`;
 * nothing here re-tests them through the scheduler.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidCronPlanError, readCronPlan } from "../selfhost/cronPlan";
import { createTick, type SchedulerConfig } from "../selfhost/scheduler";

const CONFIG: SchedulerConfig = {
  targetUrl: "http://app.internal:3000",
  cronSecret: "test-cron-secret",
  timeoutMs: 1_000,
};

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** A fake `fetch` that records every call and answers each with `respond`. */
function fakeFetch(respond: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

/** Responds with a network failure on the first call and 200 after that. */
function failOnce() {
  let attempt = 0;
  return async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError("fetch failed");
    return new Response(null, { status: 200 });
  };
}

function harness(respond: (url: string, init?: RequestInit) => Promise<Response>, config = CONFIG) {
  const { fetch, calls } = fakeFetch(respond);
  const lines: string[] = [];
  const tick = createTick(config, { fetch, log: (line) => lines.push(line) });
  return { tick, calls, lines };
}

describe("tick", () => {
  it("calls GET target + path with the CRON_SECRET bearer and logs the status", async () => {
    const { tick, calls, lines } = harness(async () => new Response(null, { status: 200 }));

    await tick("/api/cron/agent-runs");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://app.internal:3000/api/cron/agent-runs");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer test-cron-secret");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[scheduler\] GET \/api\/cron\/agent-runs → 200 in \d+ms$/);
  });

  it("logs a non-2xx status, and the next tick still runs", async () => {
    const statuses = [500, 200];
    const { tick, calls, lines } = harness(async () => new Response(null, { status: statuses.shift() }));

    await tick("/api/cron/process-notifications");
    await tick("/api/cron/process-notifications");

    expect(calls).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[scheduler\] GET \/api\/cron\/process-notifications → 500 in \d+ms$/);
    expect(lines[1]).toMatch(/→ 200 in \d+ms$/);
  });

  it("logs a thrown fetch error without rejecting, and the next tick still runs", async () => {
    const { tick, calls, lines } = harness(failOnce());

    await expect(tick("/api/cron/agent-runs")).resolves.toBeUndefined();
    await tick("/api/cron/agent-runs");

    expect(calls).toHaveLength(2);
    expect(lines[0]).toBe("[scheduler] GET /api/cron/agent-runs failed: fetch failed");
    expect(lines[1]).toMatch(/→ 200 in \d+ms$/);
  });

  it("gives up on a call that outlives the timeout, logs it, and the next tick still runs", async () => {
    let attempt = 0;
    const { tick, calls, lines } = harness(
      (_url, init) => {
        attempt += 1;
        if (attempt > 1) return Promise.resolve(new Response(null, { status: 200 }));
        // A handler that never answers: only the abort signal ends the call.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        });
      },
      { ...CONFIG, timeoutMs: 20 },
    );

    await expect(tick("/api/cron/sync-calendars")).resolves.toBeUndefined();
    await tick("/api/cron/sync-calendars");

    expect(calls).toHaveLength(2);
    expect(lines[0]).toBe("[scheduler] GET /api/cron/sync-calendars timed out after 20ms");
    expect(lines[1]).toMatch(/→ 200 in \d+ms$/);
  });
});

describe("overlap guard", () => {
  it("skips a path whose previous call is still running, while other paths still run", async () => {
    let finishSlowCall: (response: Response) => void = () => undefined;
    const { tick, calls, lines } = harness((url) => {
      if (url.endsWith("/api/cron/agent-runs") && calls.length === 1) {
        return new Promise<Response>((resolve) => (finishSlowCall = resolve));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const slow = tick("/api/cron/agent-runs");
    await tick("/api/cron/agent-runs");
    await tick("/api/cron/process-notifications");

    expect(calls.map((call) => call.url)).toEqual([
      "http://app.internal:3000/api/cron/agent-runs",
      "http://app.internal:3000/api/cron/process-notifications",
    ]);
    expect(lines).toEqual([
      "[scheduler] GET /api/cron/agent-runs skipped (previous call still running)",
      expect.stringMatching(/process-notifications → 200 in \d+ms$/),
    ]);

    // Once the slow call lands, the path is free again.
    finishSlowCall(new Response(null, { status: 200 }));
    await slow;
    await tick("/api/cron/agent-runs");
    expect(calls).toHaveLength(3);
    expect(lines.slice(2)).toEqual([
      expect.stringMatching(/agent-runs → 200 in \d+ms$/),
      expect.stringMatching(/agent-runs → 200 in \d+ms$/),
    ]);
  });

  it("frees the path after a failed call", async () => {
    const { tick, calls } = harness(failOnce());

    await tick("/api/cron/agent-runs");
    await tick("/api/cron/agent-runs");

    expect(calls).toHaveLength(2);
  });
});

describe("readCronPlan", () => {
  it("reads every crons entry as a path and a schedule", () => {
    const plan = readCronPlan({
      buildCommand: "npm run build",
      crons: [
        { path: "/api/cron/agent-runs", schedule: "* * * * *" },
        { path: "/api/cron/daily-plan-reminder", schedule: "0 8 * * *" },
      ],
    });

    expect(plan).toEqual([
      { path: "/api/cron/agent-runs", schedule: "* * * * *" },
      { path: "/api/cron/daily-plan-reminder", schedule: "0 8 * * *" },
    ]);
  });

  /** The problems a plan is rejected for, or [] when it is accepted. */
  function rejectionOf(vercelJson: unknown): string[] {
    try {
      readCronPlan(vercelJson);
      return [];
    } catch (error) {
      if (error instanceof InvalidCronPlanError) return error.problems;
      throw error;
    }
  }

  it("rejects the whole plan when one schedule is not a valid cron expression", () => {
    const problems = rejectionOf({
      crons: [
        { path: "/api/cron/agent-runs", schedule: "* * * * *" },
        { path: "/api/cron/daily-plan-reminder", schedule: "every morning" },
      ],
    });

    expect(problems).toEqual(['/api/cron/daily-plan-reminder: invalid schedule "every morning"']);
  });

  it("rejects a path outside /api/cron/", () => {
    const problems = rejectionOf({
      crons: [{ path: "/api/admin/wipe", schedule: "0 * * * *" }],
    });

    expect(problems).toEqual(['/api/admin/wipe: path must start with "/api/cron/"']);
  });

  it("rejects a file with no crons to run", () => {
    expect(rejectionOf({ buildCommand: "npm run build" })).toEqual(["vercel.json has no crons"]);
    expect(rejectionOf({ crons: [] })).toEqual(["vercel.json has no crons"]);
  });

  it("lists every bad entry, not just the first", () => {
    const problems = rejectionOf({
      crons: [
        { path: "/api/other", schedule: "nope" },
        { schedule: "0 * * * *" },
      ],
    });

    expect(problems).toEqual([
      '/api/other: path must start with "/api/cron/"',
      '/api/other: invalid schedule "nope"',
      'crons[1]: path must start with "/api/cron/"',
    ]);
  });
});

/**
 * Guard: `vercel.json` is the only place the schedule lives (ADR-0077), so every
 * cron route must have an entry there and every entry must have a route.
 * Without this, a new route deployed without a `crons` entry would never run —
 * on Vercel or self-hosted — and nothing would say so.
 */
describe("vercel.json ↔ cron route parity", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const cronDir = path.join(repoRoot, "src/app/api/cron");

  const routePaths = readdirSync(cronDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
    .filter((entry) => existsSync(path.join(cronDir, entry.name, "route.ts")))
    .map((entry) => `/api/cron/${entry.name}`)
    .sort();

  // Through readCronPlan, so the shipped file must also pass the scheduler's
  // own validation — the plan a self-host install would actually start with.
  const plannedPaths = readCronPlan(JSON.parse(readFileSync(path.join(repoRoot, "vercel.json"), "utf8")))
    .map((entry) => entry.path)
    .sort();

  it("finds the cron routes (sanity check on the directory scan)", () => {
    expect(routePaths.length).toBeGreaterThan(0);
  });

  it("schedules every cron route in vercel.json", () => {
    expect(routePaths.filter((routePath) => !plannedPaths.includes(routePath))).toEqual([]);
  });

  it("has a route for every vercel.json cron", () => {
    expect(plannedPaths.filter((plannedPath) => !routePaths.includes(plannedPath))).toEqual([]);
  });
});
