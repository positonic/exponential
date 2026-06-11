/**
 * eval-prompt — score a candidate brain prompt against the EvalCase suite,
 * offline (ADR-0013). The flywheel's verification step.
 *
 * Pipeline: export active EvalCases from the DB (read-only) → invoke
 * ../mastra's eval-replay runner as a subprocess (the candidate prompt is
 * whatever branch ../mastra has checked out; tools never execute) → judge
 * each regenerated response against the case's stored expectation with the
 * same contract judge as live scoring → print the pass-rate diff vs
 * baseline as a PR-pasteable evidence block.
 *
 * Usage:
 *   npm run eval-prompt                                  # judge candidate, no baseline
 *   npm run eval-prompt -- --save baseline.json          # save judged run (e.g. ../mastra on main)
 *   npm run eval-prompt -- --baseline baseline.json      # diff candidate vs saved baseline
 *   npm run eval-prompt -- --lane agent_behaviour        # filter exported cases by lane
 *   npm run eval-prompt -- --since 2026-06-01            # only cases created since date
 *   npm run eval-prompt -- --cases cases.json            # skip DB export, use a cases file
 *   npm run eval-prompt -- --mastra ../mastra            # runner working tree (default ../mastra)
 *
 * Typical baseline flow: check out main in ../mastra, run with --save
 * baseline.json; check out the candidate branch, run with --baseline
 * baseline.json. Requires ANTHROPIC_API_KEY (judge + replay model calls).
 * Reads EvalCase from DATABASE_URL; never writes.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

import {
  createAnthropicReplayJudge,
  diffRuns,
  formatEvidenceBlock,
  judgeReplayResults,
  type ExportedEvalCase,
  type JudgedRun,
  type ReplayOutput,
} from "../src/server/services/evalPromptOrchestrator";
import { type TranscriptTurn } from "../src/server/services/AgentEvalService";

interface Args {
  lane?: string;
  since?: Date;
  casesFile?: string;
  mastraDir: string;
  baselineFile?: string;
  saveFile?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mastraDir: "../mastra" };
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      console.error(`${flag} requires a value`);
      process.exit(1);
    }
    return v;
  };
  args.lane = value("--lane");
  const since = value("--since");
  if (since !== undefined) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      console.error(`--since requires a parseable date, got "${since}"`);
      process.exit(1);
    }
    args.since = parsed;
  }
  args.casesFile = value("--cases");
  args.mastraDir = value("--mastra") ?? args.mastraDir;
  args.baselineFile = value("--baseline");
  args.saveFile = value("--save");
  return args;
}

async function exportCases(args: Args): Promise<ExportedEvalCase[]> {
  if (args.casesFile) {
    const parsed = JSON.parse(readFileSync(args.casesFile, "utf8")) as {
      cases: ExportedEvalCase[];
    };
    return parsed.cases;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (or pass --cases <file> to skip the export)");
    process.exit(1);
  }
  try {
    console.log(`Database host: ${new URL(databaseUrl).hostname} (read-only export)`);
  } catch {
    console.log("Database host: (unparseable DATABASE_URL)");
  }

  const db = new PrismaClient();
  try {
    const rows = await db.evalCase.findMany({
      where: {
        active: true, // retired cases excluded by default (ADR-0013 decision 5)
        ...(args.lane ? { lane: args.lane } : {}),
        ...(args.since ? { createdAt: { gte: args.since } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      transcript: row.transcript as unknown as TranscriptTurn[],
      violatingTurnIndex: row.violatingTurnIndex,
      expectation: row.expectation,
      lane: row.lane,
    }));
  } finally {
    await db.$disconnect();
  }
}

function runReplay(cases: ExportedEvalCase[], mastraDir: string): ReplayOutput {
  const tempDir = mkdtempSync(path.join(tmpdir(), "eval-prompt-"));
  const casesPath = path.join(tempDir, "cases.json");
  const resultsPath = path.join(tempDir, "results.json");
  try {
    writeFileSync(casesPath, JSON.stringify({ cases }, null, 2));
    console.log(
      `Replaying ${cases.length} case(s) against the ${mastraDir} working tree (no Mastra server)...`,
    );
    execFileSync(
      "npm",
      ["--prefix", mastraDir, "run", "eval-replay", "--", casesPath, "--out", resultsPath],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    return JSON.parse(readFileSync(resultsPath, "utf8")) as ReplayOutput;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const cases = await exportCases(args);
  if (cases.length === 0) {
    console.error("No active EvalCases matched the filters — nothing to replay.");
    process.exit(1);
  }

  const replay = runReplay(cases, args.mastraDir);

  console.log(`Judging ${cases.length} replayed case(s)...`);
  const judge = createAnthropicReplayJudge(new Anthropic());
  const candidate = await judgeReplayResults(cases, replay, judge);

  let baseline: JudgedRun | null = null;
  if (args.baselineFile) {
    baseline = JSON.parse(readFileSync(args.baselineFile, "utf8")) as JudgedRun;
    if (baseline.judgeVersion !== candidate.judgeVersion) {
      console.warn(
        `⚠️  Baseline was judged with prompt ${baseline.judgeVersion}, candidate with ` +
          `${candidate.judgeVersion} — pass rates may not be comparable.`,
      );
    }
  }

  if (args.saveFile) {
    writeFileSync(args.saveFile, JSON.stringify(candidate, null, 2));
    console.log(`Saved judged run to ${args.saveFile}`);
  }

  const diff = diffRuns(candidate.verdicts, baseline?.verdicts ?? null);
  console.log(`\n${formatEvidenceBlock({ diff, candidate, baseline })}\n`);

  // Exit non-zero on regressions so CI/automation can gate on it (Level C:
  // a patch PR is only opened when evals improve without regressions).
  if (diff.regressions.length > 0) process.exit(2);
}

main().catch((error: unknown) => {
  console.error("eval-prompt failed:", error);
  process.exit(1);
});
