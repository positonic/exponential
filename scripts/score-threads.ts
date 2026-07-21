/**
 * score-threads — manual Thread-scoring trigger + Level-A report (ADR-0012).
 *
 * Drains the settled-Thread backlog through AgentEvalService (Haiku 4.5
 * judge), writes ThreadScore/EvalCase rows, then prints ranked failures
 * grouped by lane.
 *
 * ⚠️  Writes to the database at DATABASE_URL — which is PRODUCTION when run
 * with production env, because that's where Threads live (ADR-0012). The
 * script is idempotent (already-scored Threads are skipped), but it is
 * deliberate about the target: it prints the DB host and refuses non-local
 * hosts unless --yes is passed.
 *
 * Usage:
 *   npm run score-threads                      # local DB, full backlog
 *   npm run score-threads -- --limit 25        # cap this run
 *   npm run score-threads -- --yes             # required for a non-local DB host
 *
 * Requires ANTHROPIC_API_KEY for the judge. Prisma auto-loads .env (where
 * DATABASE_URL lives), but not .env.local — so this script loads .env.local
 * (then .env) itself before anything reads the environment. Values already set
 * in the shell win, so `DATABASE_URL=… npm run score-threads` still overrides.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  AgentEvalService,
  buildLaneReport,
  JUDGE_MODEL,
  JUDGE_VERSION,
} from "../src/server/services/AgentEvalService";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

/**
 * Load .env.local then .env into process.env without overriding anything the
 * shell already set. Mirrors Next.js precedence (.env.local wins over .env)
 * while leaving explicit shell/inline vars untouched. Kept dependency-free on
 * purpose: dotenv is only a transitive dep here.
 */
function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    let contents: string;
    try {
      contents = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue; // absent file is fine
    }
    for (const line of contents.split("\n")) {
      const match = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/.exec(line);
      const key = match?.[1];
      if (key === undefined || process.env[key] !== undefined) continue;
      let value = (match?.[2] ?? "").trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]): { limit: number | undefined; yes: boolean } {
  const yes = argv.includes("--yes");
  const limitIndex = argv.indexOf("--limit");
  let limit: number | undefined;
  if (limitIndex !== -1) {
    const raw = argv[limitIndex + 1];
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error("--limit requires a positive integer");
      process.exit(1);
    }
    limit = parsed;
  }
  return { limit, yes };
}

function dbHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const { limit, yes } = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const host = dbHost(databaseUrl);
  console.log(`Database host: ${host}`);
  if (!LOCAL_HOSTS.has(host)) {
    if (!yes) {
      console.error(
        `Refusing to write to non-local database host "${host}" without --yes.\n` +
          "This script writes ThreadScore/EvalCase rows to the DB at DATABASE_URL " +
          "(production, where Threads live). Re-run with --yes if that is intended.",
      );
      process.exit(1);
    }
    console.log("--yes supplied — proceeding against non-local host.");
  }

  const db = new PrismaClient();
  const service = new AgentEvalService(db);

  try {
    const settled = await service.findSettledThreadIds();
    const planned = limit !== undefined ? Math.min(limit, settled.length) : settled.length;
    console.log(
      `Judge: ${JUDGE_MODEL} (prompt ${JUDGE_VERSION}). ` +
        `Settled unscored Threads: ${settled.length}; judging ${planned} this run.\n`,
    );

    const { results, errors } = await service.scoreBacklog({
      limit,
      onProgress: (done, total, result) => {
        const verdict =
          result.failureLane === null
            ? `PASS ${result.overallScore}`
            : `FAIL ${result.overallScore} [${result.failureLane}]`;
        console.log(
          `[${done}/${total}] ${result.conversationId} — ${verdict} (${result.turnCount} turns)`,
        );
      },
      onThreadError: (conversationId, error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[skip] ${conversationId} — judging failed, left unscored for the next run: ${oneLine(message)}`,
        );
      },
    });

    const failures = results.filter((result) => result.failureLane !== null);
    console.log(
      `\nDone. Judged ${results.length} Thread(s): ` +
        `${results.length - failures.length} passed, ${failures.length} failed` +
        (errors.length > 0 ? `; ${errors.length} errored (will retry next run).` : "."),
    );

    const report = buildLaneReport(results);
    if (report.length === 0) {
      console.log("No failures — nothing to route. 🎉");
      return;
    }

    console.log("\n=== Level-A report: ranked failures by lane ===");
    for (const entry of report) {
      console.log(`\n${entry.lane} — ${entry.count} failed Thread(s)`);
      for (const example of entry.examples) {
        console.log(`  • ${example.conversationId} (score ${example.overallScore})`);
        console.log(`    reasoning:   ${oneLine(example.reasoning)}`);
        if (example.expectation) {
          console.log(`    expectation: ${oneLine(example.expectation)}`);
        }
      }
    }
    console.log(
      "\nLanes: code_bug → tRPC/tool fix here; agent_behaviour → prompt fix " +
        "(router persona here / brain in ../mastra); capability_gap → product Ticket.",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("score-threads failed:", error);
  process.exit(1);
});
