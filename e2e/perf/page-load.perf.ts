/**
 * Page-load performance harness. One test per route in routes.ts; each
 * records PERF_RUNS (default 3) hard loads and PERF_RUNS client navigations,
 * then replays every tRPC procedure the hard load issued on its own to time
 * it server-side in isolation. Raw per-route JSON lands in
 * e2e/.results/perf/<PERF_RUN_ID>/; `npx tsx e2e/perf/report.ts` turns a run
 * directory into the ranked table.
 *
 * MUST run against a production build — `next dev` timings are meaningless:
 *
 *   npx next build && npm run test:perf
 *
 * Filters: PERF_GROUP=ws-crm (a routes.ts group), PERF_ROUTES=<regex on the
 * pattern>. Knobs: PERF_RUNS, PERF_LATENCY_MS (CDP-added RTT, default 0),
 * PERF_QUIET_MS, PERF_READY_TIMEOUT_MS. See collect.ts for what "content
 * ready" means.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { request as playwrightRequest, test, type Browser, type BrowserContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import {
  NetworkRecorder,
  PAGE_INIT_SCRIPT,
  hasPgStatStatements,
  median,
  readDbStats,
  resetDbStats,
  summarizeNetwork,
  waitForContentReady,
  type DbStats,
  type NetSummary,
} from "./collect";
import { resolveRoutes, routeId, type PerfParams, type ResolvedRoute } from "./routes";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(HERE, "..", ".auth");
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const LATENCY_MS = Number(process.env.PERF_LATENCY_MS ?? 0);
const PROBE_RUNS = Number(process.env.PERF_PROBE_RUNS ?? 3);
const RUN_ID = process.env.PERF_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(HERE, "..", ".results", "perf", RUN_ID);
const STORAGE_STATE = path.join(AUTH_DIR, "storageState.json");

const params = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "perf-params.json"), "utf8")) as PerfParams;
const groupFilter = process.env.PERF_GROUP?.split(",");
const routeFilter = process.env.PERF_ROUTES ? new RegExp(process.env.PERF_ROUTES) : null;
const routes = resolveRoutes(params).filter(
  (r) => (!groupFilter || groupFilter.includes(r.group)) && (!routeFilter || routeFilter.test(r.pattern)),
);

export interface LoadRun {
  finalPath: string;
  httpStatus: number | null;
  ttfbMs: number | null;
  documentEndMs: number | null;
  domContentLoadedMs: number | null;
  lcpMs: number | null;
  readyMs: number;
  readyTimedOut: boolean;
  blockedBy: string[];
  net: NetSummary;
  db: DbStats | null;
  pageErrors: string[];
  trpcGetUrls: string[];
}

export interface NavRun extends Omit<LoadRun, "ttfbMs" | "documentEndMs" | "domContentLoadedMs" | "lcpMs" | "httpStatus"> {
  startPath: string;
  via: "sidebar" | "router.push";
}

export interface ProcedureProbe {
  procedure: string;
  input: unknown;
  medianMs: number;
  runsMs: number[];
  bytes: number;
  status: number;
}

export interface RouteResult {
  pattern: string;
  path: string | null;
  group: string;
  skip?: string;
  buildId: string | null;
  latencyMs: number;
  hard: LoadRun[];
  nav: NavRun[];
  probes: ProcedureProbe[];
  medians?: {
    hardReadyMs: number;
    hardTtfbMs: number;
    hardLcpMs: number;
    hardJsKb: number;
    hardTrpcRequests: number;
    hardTrpcProcedures: number;
    hardTrpcKb: number;
    hardWaterfallDepth: number;
    hardDbCalls: number;
    navReadyMs: number;
    navTrpcRequests: number;
    navWaterfallDepth: number;
    navDbCalls: number;
  };
}

let db: PrismaClient | null = null;
let dbStatsEnabled = false;
const probeCache = new Map<string, ProcedureProbe>();

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { loadDevEnvOrThrow } = await import("../../scripts/dev-fixture/env");
  loadDevEnvOrThrow();
  const { PrismaClient } = await import("@prisma/client");
  db = new PrismaClient();
  dbStatsEnabled = await hasPgStatStatements(db);
  if (!dbStatsEnabled) console.warn("[perf] pg_stat_statements unavailable — DB query counts will be null");
});

test.afterAll(async () => {
  await db?.$disconnect();
});

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });
}

async function dbReset(): Promise<void> {
  if (db && dbStatsEnabled) await resetDbStats(db);
}

async function dbRead(): Promise<DbStats | null> {
  return db && dbStatsEnabled ? readDbStats(db) : null;
}

function trpcGetUrls(net: NetworkRecorder, sinceMs: number, untilMs: number): string[] {
  return net
    .since(sinceMs)
    .filter((r) => r.procedures && r.method === "GET" && r.startMs <= untilMs)
    .map((r) => r.url);
}

async function measureHardLoad(browser: Browser, url: string): Promise<LoadRun> {
  const context = await newContext(browser);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 200)));
  await page.addInitScript(PAGE_INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  const net = new NetworkRecorder(cdp);
  await net.start(LATENCY_MS);
  await dbReset();

  const startMs = Date.now();
  const response = await page.goto(url, { waitUntil: "commit" });
  const ready = await waitForContentReady(page, net, startMs);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return {
      timeOrigin: performance.timeOrigin,
      ttfb: nav ? nav.responseStart : null,
      documentEnd: nav ? nav.responseEnd : null,
      dcl: nav ? nav.domContentLoadedEventEnd : null,
      path: location.pathname + location.search,
    };
  });
  const originMs = timing.timeOrigin;
  const run: LoadRun = {
    finalPath: timing.path,
    httpStatus: response?.status() ?? null,
    ttfbMs: timing.ttfb !== null ? Math.round(timing.ttfb) : null,
    documentEndMs: timing.documentEnd !== null ? Math.round(timing.documentEnd) : null,
    domContentLoadedMs: timing.dcl !== null ? Math.round(timing.dcl) : null,
    lcpMs: ready.lcpAtMs !== null ? Math.round(ready.lcpAtMs - originMs) : null,
    readyMs: Math.round(ready.readyAtMs - originMs),
    readyTimedOut: ready.timedOut,
    blockedBy: ready.blockedBy,
    net: summarizeNetwork([...net.requests.values()], originMs, ready.settledAtMs),
    db: await dbRead(),
    pageErrors,
    trpcGetUrls: trpcGetUrls(net, 0, ready.settledAtMs),
  };
  await context.close();
  return run;
}

async function measureNavigation(browser: Browser, targetPath: string, workspaceSlug: string): Promise<NavRun> {
  const home = `/w/${workspaceSlug}/home`;
  const startPath = targetPath.split("?")[0] === home ? `/w/${workspaceSlug}/projects` : home;
  const context = await newContext(browser);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 200)));
  await page.addInitScript(PAGE_INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  const net = new NetworkRecorder(cdp);
  await net.start(LATENCY_MS);

  const loadStart = Date.now();
  await page.goto(startPath, { waitUntil: "commit" });
  await waitForContentReady(page, net, loadStart);
  // Let viewport Link prefetches land, as they would for a real user.
  await page.waitForTimeout(750);
  net.reset();
  await dbReset();

  const link = page.locator(`aside a[href="${targetPath}"]`).first();
  const via: NavRun["via"] = (await link.count()) > 0 && (await link.isVisible()) ? "sidebar" : "router.push";
  const startPathname = new URL(page.url()).pathname;
  const clickMs = Date.now();
  if (via === "sidebar") {
    await link.click();
  } else {
    await page.evaluate((p) => {
      const w = window as unknown as { next?: { router?: { push: (href: string) => void } } };
      if (!w.next?.router) throw new Error("window.next.router unavailable");
      w.next.router.push(p);
    }, targetPath);
  }
  await page
    .waitForFunction((from) => location.pathname !== from, startPathname, { timeout: 10_000 })
    .catch(() => undefined);
  const ready = await waitForContentReady(page, net, clickMs);
  const run: NavRun = {
    startPath,
    via,
    finalPath: await page.evaluate(() => location.pathname + location.search),
    readyMs: Math.round(ready.readyAtMs - clickMs),
    readyTimedOut: ready.timedOut,
    blockedBy: ready.blockedBy,
    net: summarizeNetwork(net.since(clickMs), clickMs, ready.settledAtMs),
    db: await dbRead(),
    pageErrors,
    trpcGetUrls: trpcGetUrls(net, clickMs, ready.settledAtMs),
  };
  await context.close();
  return run;
}

/** Split a batched tRPC GET into one single-procedure URL per procedure. */
function splitBatch(url: string): { procedure: string; input: unknown; url: string }[] {
  const u = new URL(url);
  const procedures = decodeURIComponent(u.pathname.replace(/^\/api\/trpc\//, "")).split(",");
  const raw = u.searchParams.get("input");
  const inputs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  return procedures.map((procedure, i) => {
    const input = inputs[String(i)];
    const qs = new URLSearchParams({ batch: "1" });
    if (input !== undefined) qs.set("input", JSON.stringify({ 0: input }));
    return { procedure, input, url: `/api/trpc/${procedure}?${qs.toString()}` };
  });
}

async function probeProcedures(baseURL: string, urls: string[]): Promise<ProcedureProbe[]> {
  const api = await playwrightRequest.newContext({ baseURL, storageState: STORAGE_STATE });
  const probes: ProcedureProbe[] = [];
  try {
    for (const single of urls.flatMap(splitBatch)) {
      const cached = probeCache.get(single.url);
      if (cached) {
        probes.push(cached);
        continue;
      }
      const runsMs: number[] = [];
      let bytes = 0;
      let status = 0;
      for (let i = 0; i < PROBE_RUNS; i++) {
        const t0 = performance.now();
        const res = await api.get(single.url);
        const body = await res.body();
        runsMs.push(Math.round(performance.now() - t0));
        bytes = body.length;
        status = res.status();
      }
      const probe = { procedure: single.procedure, input: single.input, medianMs: median(runsMs), runsMs, bytes, status };
      probeCache.set(single.url, probe);
      probes.push(probe);
    }
  } finally {
    await api.dispose();
  }
  return probes;
}

function computeMedians(result: RouteResult): RouteResult["medians"] {
  const m = (xs: (number | null | undefined)[]) => median(xs.filter((x): x is number => typeof x === "number"));
  const { hard, nav } = result;
  return {
    hardReadyMs: m(hard.map((r) => r.readyMs)),
    hardTtfbMs: m(hard.map((r) => r.ttfbMs)),
    hardLcpMs: m(hard.map((r) => r.lcpMs)),
    hardJsKb: Math.round(m(hard.map((r) => r.net.jsBytes)) / 1024),
    hardTrpcRequests: m(hard.map((r) => r.net.trpcRequests)),
    hardTrpcProcedures: m(hard.map((r) => r.net.trpcProcedures)),
    hardTrpcKb: Math.round(m(hard.map((r) => r.net.trpcBytes)) / 1024),
    hardWaterfallDepth: m(hard.map((r) => r.net.waterfallDepth)),
    hardDbCalls: m(hard.map((r) => r.db?.calls)),
    navReadyMs: m(nav.map((r) => r.readyMs)),
    navTrpcRequests: m(nav.map((r) => r.net.trpcRequests)),
    navWaterfallDepth: m(nav.map((r) => r.net.waterfallDepth)),
    navDbCalls: m(nav.map((r) => r.db?.calls)),
  };
}

function writeResult(route: ResolvedRoute, result: RouteResult): void {
  fs.writeFileSync(path.join(OUT_DIR, `${routeId(route.pattern)}.json`), JSON.stringify(result, null, 2));
}

function readBuildId(): string | null {
  try {
    return fs.readFileSync(path.join(HERE, "..", "..", ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
}

for (const route of routes) {
  test(`${route.group} ${route.pattern}`, async ({ browser, baseURL }) => {
    test.setTimeout(10 * 60_000);
    const base: RouteResult = {
      pattern: route.pattern,
      path: route.path,
      group: route.group,
      skip: route.skip,
      buildId: readBuildId(),
      latencyMs: LATENCY_MS,
      hard: [],
      nav: [],
      probes: [],
    };
    if (!route.path) {
      writeResult(route, base);
      test.skip(true, route.skip);
      return;
    }

    // Warm the route once (server module init, first-request compile of the
    // RSC handler) so run 1 isn't an outlier nobody's users ever see.
    await measureHardLoad(browser, route.path);

    for (let i = 0; i < RUNS; i++) base.hard.push(await measureHardLoad(browser, route.path));
    for (let i = 0; i < RUNS; i++) base.nav.push(await measureNavigation(browser, route.path, params.workspaceSlug ?? ""));
    base.probes = await probeProcedures(baseURL ?? "", base.hard[0]?.trpcGetUrls ?? []);
    base.medians = computeMedians(base);
    writeResult(route, base);
  });
}
