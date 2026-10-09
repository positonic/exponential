/**
 * Measurement primitives for the perf harness.
 *
 * Network timing comes from CDP (not page.on("response")): it sees the true
 * end of streamed bodies (tRPC httpBatchStreamLink, RSC flight) and the
 * encoded byte counts. Timestamps are normalised to epoch ms so they compare
 * with the in-page clock used for DOM mutation / LCP entries.
 *
 * "Content ready" is deliberately generic, because 150 pages share no
 * readiness marker: the moment after which, for QUIET_MS, `<main>` saw no
 * childList/characterData mutation, no tRPC/RSC request was in flight, and no
 * Mantine Loader / visible Skeleton / aria-busy element remained in `<main>`.
 * The reported value is the last such activity, not the end of the quiet
 * window. Pages that never settle report `readyTimedOut` and what blocked.
 */
import type { CDPSession, Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

export const QUIET_MS = Number(process.env.PERF_QUIET_MS ?? 1000);
export const READY_TIMEOUT_MS = Number(process.env.PERF_READY_TIMEOUT_MS ?? 20_000);

const LOADER_SELECTOR = [
  "main .mantine-Loader-root",
  'main .mantine-Skeleton-root[data-visible="true"]',
  'main [aria-busy="true"]',
].join(", ");

export interface NetRequest {
  id: string;
  url: string;
  method: string;
  type: string;
  startMs: number;
  endMs?: number;
  status?: number;
  /** Wire bytes; reliable only for requests that reach loadingFinished. */
  encodedBytes?: number;
  /** Decompressed body bytes, summed as chunks arrive (works for cancelled streams). */
  decodedBytes?: number;
  failed?: boolean;
  /** tRPC procedures in this (possibly batched) request. */
  procedures?: string[];
  isRsc?: boolean;
}

/** Epoch-ms clock shared by CDP events and the page. */
export class NetworkRecorder {
  readonly requests = new Map<string, NetRequest>();
  private wallOffsetMs: number | null = null;

  constructor(private readonly cdp: CDPSession) {}

  async start(latencyMs = 0): Promise<void> {
    await this.cdp.send("Network.enable");
    await this.cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    if (latencyMs > 0) {
      await this.cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: latencyMs,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    this.cdp.on("Network.requestWillBeSent", (e) => {
      // wallTime (s, epoch) and timestamp (s, monotonic) of the same instant
      // give the monotonic → epoch offset used for every later event.
      this.wallOffsetMs ??= e.wallTime * 1000 - e.timestamp * 1000;
      const url = e.request.url;
      const trpc = /\/api\/trpc\/([^?]+)/.exec(url);
      const headers = e.request.headers as Record<string, string | undefined>;
      this.requests.set(e.requestId, {
        id: e.requestId,
        url,
        method: e.request.method,
        type: e.type ?? "Other",
        startMs: this.toEpoch(e.timestamp),
        procedures: trpc?.[1] ? decodeURIComponent(trpc[1]).split(",") : undefined,
        isRsc: headers.RSC === "1" || headers.rsc === "1" || url.includes("_rsc="),
      });
    });
    this.cdp.on("Network.responseReceived", (e) => {
      const r = this.requests.get(e.requestId);
      if (r) {
        r.status = e.response.status;
        r.type = e.type ?? r.type;
      }
    });
    // Streamed bodies (tRPC httpBatchStreamLink, RSC) are cancelled by the
    // client once fully read, so Chromium reports loadingFailed/ERR_ABORTED
    // and never loadingFinished — no wire size. Sum decoded chunk sizes
    // instead, which is also the payload the client has to parse.
    this.cdp.on("Network.dataReceived", (e) => {
      const r = this.requests.get(e.requestId);
      if (r) r.decodedBytes = (r.decodedBytes ?? 0) + e.dataLength;
    });
    this.cdp.on("Network.loadingFinished", (e) => {
      const r = this.requests.get(e.requestId);
      if (r) {
        r.endMs = this.toEpoch(e.timestamp);
        r.encodedBytes = e.encodedDataLength;
      }
    });
    this.cdp.on("Network.loadingFailed", (e) => {
      const r = this.requests.get(e.requestId);
      if (r) {
        r.endMs = this.toEpoch(e.timestamp);
        r.failed = true;
      }
    });
  }

  private toEpoch(monotonicSeconds: number): number {
    return monotonicSeconds * 1000 + (this.wallOffsetMs ?? 0);
  }

  reset(): void {
    this.requests.clear();
  }

  /** Requests that started at/after `sinceMs`. */
  since(sinceMs: number): NetRequest[] {
    return [...this.requests.values()].filter((r) => r.startMs >= sinceMs - 5);
  }

  /**
   * Data requests still streaming. A 4xx/5xx response counts as settled even
   * if its body never completes: a Link prefetch of a 404 route otherwise
   * stays "in flight" forever and pins the page at the ready timeout.
   */
  inFlightDataRequests(): NetRequest[] {
    return [...this.requests.values()].filter(
      (r) => (r.procedures ?? r.isRsc) && r.endMs === undefined && (r.status ?? 0) < 400,
    );
  }
}

/** Injected before any page script: DOM-mutation clock + LCP buffer. */
export const PAGE_INIT_SCRIPT = `
(() => {
  const now = () => performance.timeOrigin + performance.now();
  const state = { lastMainMutation: 0, lcp: null, lcpSize: 0, observing: false };
  window.__perf = state;
  const attach = () => {
    const main = document.querySelector('main');
    if (!main || state.observing) return;
    state.observing = true;
    state.lastMainMutation = now();
    new MutationObserver(() => { state.lastMainMutation = now(); })
      .observe(main, { childList: true, subtree: true, characterData: true });
  };
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.lcp = performance.timeOrigin + e.startTime;
        state.lcpSize = e.size;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
})();
`;

interface PageClock {
  now: number;
  lastMainMutation: number;
  lcp: number | null;
  loaders: string[];
  hasMain: boolean;
}

async function readPageClock(page: Page): Promise<PageClock> {
  return page.evaluate((selector) => {
    const w = window as unknown as { __perf?: { lastMainMutation: number; lcp: number | null } };
    const loaders = [...document.querySelectorAll(selector)]
      .filter((el) => (el as HTMLElement).offsetWidth > 0 || (el as HTMLElement).offsetHeight > 0)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 2).join(".")}`);
    return {
      now: performance.timeOrigin + performance.now(),
      lastMainMutation: w.__perf?.lastMainMutation ?? 0,
      lcp: w.__perf?.lcp ?? null,
      loaders,
      hasMain: !!document.querySelector("main"),
    };
  }, LOADER_SELECTOR);
}

export interface ReadyResult {
  readyAtMs: number;
  /** When polling stopped — the accounting window for requests and bytes. */
  settledAtMs: number;
  timedOut: boolean;
  blockedBy: string[];
  lcpAtMs: number | null;
}

/**
 * Poll until the page is quiet (see file header). `sinceMs` is the epoch-ms
 * start of the measured interaction (navigation start or click).
 */
export async function waitForContentReady(page: Page, net: NetworkRecorder, sinceMs: number): Promise<ReadyResult> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let clock: PageClock | null = null;
  while (Date.now() < deadline) {
    try {
      clock = await readPageClock(page);
    } catch {
      // Navigation in progress (redirect, router.replace) — context destroyed.
      await page.waitForTimeout(50);
      continue;
    }
    const inflight = net.inFlightDataRequests();
    const lastNetEnd = Math.max(0, ...net.since(sinceMs).filter((r) => r.procedures ?? r.isRsc).map((r) => r.endMs ?? 0));
    const lastActivity = Math.max(sinceMs, clock.lastMainMutation, lastNetEnd);
    if (clock.hasMain && inflight.length === 0 && clock.loaders.length === 0 && clock.now - lastActivity >= QUIET_MS) {
      return { readyAtMs: lastActivity, settledAtMs: lastActivity, timedOut: false, blockedBy: [], lcpAtMs: clock.lcp };
    }
    await page.waitForTimeout(50);
  }
  const inflight = net.inFlightDataRequests().map((r) => `inflight:${r.procedures?.join(",") ?? r.url}`);
  return {
    readyAtMs: Math.max(sinceMs, clock?.lastMainMutation ?? sinceMs),
    settledAtMs: Date.now(),
    timedOut: true,
    blockedBy: [...(clock?.loaders ?? []).map((l) => `loader:${l}`), ...inflight, ...(clock?.hasMain ? [] : ["no <main>"])],
    lcpAtMs: clock?.lcp ?? null,
  };
}

export interface TrpcCall {
  procedures: string[];
  method: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Decoded response payload bytes. */
  bytes: number;
  status?: number;
  /** Index of the request this one plausibly waited on (started ≤150ms after it ended). */
  waitsOn: number | null;
}

export interface NetSummary {
  trpcRequests: number;
  trpcProcedures: number;
  trpcTotalMs: number;
  trpcSpanMs: number;
  /** Decoded tRPC payload bytes. */
  trpcBytes: number;
  waterfallDepth: number;
  calls: TrpcCall[];
  duplicateProcedures: string[];
  rsc: { count: number; totalMs: number; bytes: number };
  jsBytes: number;
  jsRequests: number;
  cssBytes: number;
  totalBytes: number;
  jsUrls: { url: string; bytes: number }[];
  /** HTTP >= 400, plus requests aborted before any response arrived. */
  failed: string[];
}

const WATERFALL_GAP_MS = 150;

export function summarizeNetwork(requests: NetRequest[], originMs: number, untilMs: number): NetSummary {
  const inWindow = requests.filter((r) => r.startMs <= untilMs + 5);
  const trpc = inWindow
    .filter((r) => r.procedures && r.endMs !== undefined)
    .sort((a, b) => a.startMs - b.startMs);
  const calls: TrpcCall[] = trpc.map((r) => ({
    procedures: r.procedures ?? [],
    method: r.method,
    startMs: Math.round(r.startMs - originMs),
    endMs: Math.round((r.endMs ?? r.startMs) - originMs),
    durationMs: Math.round((r.endMs ?? r.startMs) - r.startMs),
    bytes: r.decodedBytes ?? 0,
    status: r.status,
    waitsOn: null,
  }));
  // A request "waits on" the latest-ending earlier request that finished just
  // before it started — the signature of a query gated on another's data.
  const depth: number[] = [];
  calls.forEach((call, i) => {
    let best: number | null = null;
    for (let j = 0; j < i; j++) {
      const prev = calls[j]!;
      const gap = call.startMs - prev.endMs;
      if (gap >= -2 && gap <= WATERFALL_GAP_MS && (best === null || prev.endMs > calls[best]!.endMs)) best = j;
    }
    call.waitsOn = best;
    depth[i] = best === null ? 1 : (depth[best] ?? 1) + 1;
  });
  const procCounts = new Map<string, number>();
  for (const c of calls) for (const p of c.procedures) procCounts.set(p, (procCounts.get(p) ?? 0) + 1);

  const rsc = inWindow.filter((r) => r.isRsc && r.type !== "Document");
  const scripts = inWindow.filter((r) => r.type === "Script");
  const sum = (xs: NetRequest[]) => xs.reduce((acc, r) => acc + (r.encodedBytes ?? 0), 0);

  return {
    trpcRequests: calls.length,
    trpcProcedures: calls.reduce((acc, c) => acc + c.procedures.length, 0),
    trpcTotalMs: calls.reduce((acc, c) => acc + c.durationMs, 0),
    trpcSpanMs: calls.length ? Math.max(...calls.map((c) => c.endMs)) - Math.min(...calls.map((c) => c.startMs)) : 0,
    trpcBytes: calls.reduce((acc, c) => acc + c.bytes, 0),
    waterfallDepth: depth.length ? Math.max(...depth) : 0,
    calls,
    duplicateProcedures: [...procCounts.entries()].filter(([, n]) => n > 1).map(([p, n]) => `${p}×${n}`),
    rsc: {
      count: rsc.length,
      totalMs: Math.round(rsc.reduce((acc, r) => acc + ((r.endMs ?? r.startMs) - r.startMs), 0)),
      bytes: rsc.reduce((acc, r) => acc + (r.decodedBytes ?? 0), 0),
    },
    jsBytes: sum(scripts),
    jsRequests: scripts.length,
    cssBytes: sum(inWindow.filter((r) => r.type === "Stylesheet")),
    totalBytes: sum(inWindow),
    jsUrls: scripts.map((r) => ({ url: new URL(r.url).pathname, bytes: r.encodedBytes ?? 0 })),
    failed: inWindow
      .filter((r) => (r.failed && r.status === undefined) || (r.status ?? 0) >= 400)
      .map((r) => `${(r.status ?? 0) >= 400 ? r.status : "aborted"} ${r.procedures?.join(",") ?? new URL(r.url).pathname}`),
  };
}

// ---------------------------------------------------------------------------
// Postgres statement counts (optional: needs pg_stat_statements)
// ---------------------------------------------------------------------------

export interface DbStats {
  calls: number;
  totalMs: number;
  top: { calls: number; totalMs: number; query: string }[];
}

export async function hasPgStatStatements(db: PrismaClient): Promise<boolean> {
  try {
    await db.$queryRawUnsafe("SELECT 1 FROM pg_stat_statements LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function resetDbStats(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe("SELECT pg_stat_statements_reset()");
}

export async function readDbStats(db: PrismaClient): Promise<DbStats> {
  const rows = await db.$queryRawUnsafe<{ calls: bigint; total: number; query: string }[]>(
    `SELECT calls, total_exec_time AS total, query FROM pg_stat_statements
     WHERE query NOT ILIKE '%pg_stat_statements%' AND query NOT IN ('BEGIN', 'COMMIT', 'SELECT $1')
     ORDER BY total_exec_time DESC`,
  );
  return {
    calls: rows.reduce((acc, r) => acc + Number(r.calls), 0),
    totalMs: Math.round(rows.reduce((acc, r) => acc + r.total, 0) * 10) / 10,
    top: rows.slice(0, 5).map((r) => ({
      calls: Number(r.calls),
      totalMs: Math.round(r.total * 10) / 10,
      query: r.query.replace(/\s+/g, " ").slice(0, 240),
    })),
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}
