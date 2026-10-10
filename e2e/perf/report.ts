/**
 * Turn a perf run directory into the ranked report.
 *
 *   npx tsx e2e/perf/report.ts e2e/.results/perf/<run-id> [--json]
 *
 * Writes report.md and summary.json into the run directory and prints the
 * markdown. Besides the per-route table it derives the SHARED cost every page
 * pays: tRPC procedures and JS chunks present in >=90% of measured hard loads.
 */
import fs from "fs";
import path from "path";
import type { RouteResult } from "./page-load.perf";

const SHARED_THRESHOLD = 0.9;

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const fmt = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "–" : String(n));

function flags(r: RouteResult): string {
  const out: string[] = [];
  const first = r.hard[0];
  if (r.hard.some((h) => h.readyTimedOut)) out.push(`timeout(${[...new Set(r.hard.flatMap((h) => h.blockedBy))].join("; ")})`);
  if (first && r.path && first.finalPath.split("?")[0] !== r.path.split("?")[0]) out.push(`→${first.finalPath.split("?")[0]}`);
  const dups = [...new Set(r.hard.flatMap((h) => h.net.duplicateProcedures))];
  if (dups.length) out.push(`dup:${dups.join(",")}`);
  const errs = r.hard.flatMap((h) => h.pageErrors).length;
  if (errs) out.push(`pageerror×${errs}`);
  const http = [...new Set(r.hard.flatMap((h) => h.net.failed.filter((f) => !f.startsWith("aborted") && !f.includes("_vercel") && !f.includes("/g/collect"))))];
  if (http.length) out.push(http.join(","));
  return out.join(" ");
}

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: tsx e2e/perf/report.ts <run-dir>");
  const results = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "summary.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RouteResult);

  const measured = results.filter((r) => r.medians && r.hard.length > 0);
  const skipped = results.filter((r) => !r.medians);
  measured.sort((a, b) => b.medians!.hardReadyMs - a.medians!.hardReadyMs);

  // ---- shared cost ----
  const hardLoads = measured.flatMap((r) => r.hard);
  const procPresence = new Map<string, number>();
  const jsPresence = new Map<string, { n: number; bytes: number }>();
  for (const load of hardLoads) {
    for (const p of new Set(load.net.calls.flatMap((c) => c.procedures))) procPresence.set(p, (procPresence.get(p) ?? 0) + 1);
    for (const js of load.net.jsUrls) {
      const e = jsPresence.get(js.url) ?? { n: 0, bytes: 0 };
      jsPresence.set(js.url, { n: e.n + 1, bytes: Math.max(e.bytes, js.bytes) });
    }
  }
  const probeByProc = new Map<string, { ms: number[]; bytes: number[] }>();
  for (const r of measured) {
    for (const p of r.probes) {
      const e = probeByProc.get(p.procedure) ?? { ms: [], bytes: [] };
      e.ms.push(p.medianMs);
      e.bytes.push(p.bytes);
      probeByProc.set(p.procedure, e);
    }
  }
  const sharedProcs = [...procPresence.entries()]
    .filter(([, n]) => n / hardLoads.length >= SHARED_THRESHOLD)
    .map(([procedure, n]) => ({
      procedure,
      presence: Math.round((n / hardLoads.length) * 100),
      probeMedianMs: median(probeByProc.get(procedure)?.ms ?? []),
      bytesMedian: median(probeByProc.get(procedure)?.bytes ?? []),
    }))
    .sort((a, b) => b.bytesMedian - a.bytesMedian);
  const sharedJs = [...jsPresence.entries()].filter(([, e]) => e.n / hardLoads.length >= SHARED_THRESHOLD);
  const sharedJsKb = Math.round(sharedJs.reduce((acc, [, e]) => acc + e.bytes, 0) / 1024);

  const slowProcs = [...probeByProc.entries()]
    .map(([procedure, e]) => ({ procedure, medianMs: median(e.ms), maxMs: Math.max(...e.ms), bytesMedian: median(e.bytes), pages: e.ms.length }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, 25);

  const buildIds = [...new Set(results.map((r) => r.buildId))];
  const lines: string[] = [];
  lines.push(`# Page-load perf report — ${path.basename(dir)}`);
  lines.push("");
  lines.push(`Build ${buildIds.join(", ")} · added latency ${results[0]?.latencyMs ?? 0}ms · ${measured.length} routes measured, ${skipped.length} skipped · medians of ${measured[0]?.hard.length ?? 0} runs`);
  lines.push("");
  lines.push("## Routes ranked by hard-load content-ready (median)");
  lines.push("");
  lines.push("| # | Route | Hard ready | LCP | TTFB | JS KB | tRPC req/proc | tRPC KB (decoded) | WF depth | DB q | Nav ready | Nav via | Nav tRPC | Nav WF | Nav DB q | Flags |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  measured.forEach((r, i) => {
    const m = r.medians!;
    lines.push(
      `| ${i + 1} | \`${r.pattern}\` | ${fmt(m.hardReadyMs)} | ${fmt(m.hardLcpMs)} | ${fmt(m.hardTtfbMs)} | ${fmt(m.hardJsKb)} | ${fmt(m.hardTrpcRequests)}/${fmt(m.hardTrpcProcedures)} | ${fmt(m.hardTrpcKb)} | ${fmt(m.hardWaterfallDepth)} | ${fmt(m.hardDbCalls)} | ${fmt(m.navReadyMs)} | ${r.nav[0]?.via ?? "–"} | ${fmt(m.navTrpcRequests)} | ${fmt(m.navWaterfallDepth)} | ${fmt(m.navDbCalls)} | ${flags(r)} |`,
    );
  });
  lines.push("");
  lines.push("## Shared cost (present in ≥90% of hard loads)");
  lines.push("");
  lines.push(`Shared JS: ${sharedJs.length} chunks, ${sharedJsKb} KB transferred.`);
  lines.push("");
  lines.push("| Procedure | Presence % | Probe median ms | Response bytes |");
  lines.push("|---|---|---|---|");
  for (const p of sharedProcs) lines.push(`| \`${p.procedure}\` | ${p.presence} | ${fmt(p.probeMedianMs)} | ${fmt(p.bytesMedian)} |`);
  lines.push("");
  lines.push("## Slowest procedures in isolation (probe median across pages)");
  lines.push("");
  lines.push("| Procedure | Median ms | Max ms | Response bytes | Pages |");
  lines.push("|---|---|---|---|---|");
  for (const p of slowProcs) lines.push(`| \`${p.procedure}\` | ${p.medianMs} | ${p.maxMs} | ${p.bytesMedian} | ${p.pages} |`);
  lines.push("");
  lines.push("## Skipped");
  lines.push("");
  for (const r of skipped) lines.push(`- \`${r.pattern}\` — ${r.skip ?? "no data"}`);

  const md = lines.join("\n");
  fs.writeFileSync(path.join(dir, "report.md"), md);
  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify({ sharedProcs, sharedJsKb, sharedJsChunks: sharedJs.length, slowProcs, routes: measured.map((r) => ({ pattern: r.pattern, group: r.group, medians: r.medians, flags: flags(r) })) }, null, 2),
  );
  console.log(md);
}

main();
