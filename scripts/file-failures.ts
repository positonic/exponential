/**
 * file-failures — Level B lane-routed auto-filing (ADR-0012 decision 4).
 *
 * Takes scored, not-yet-filed failures and files each cluster into the
 * tracker owned by its Failure lane:
 *
 *   code_bug        → beads issue in this repo
 *   agent_behaviour → beads issue in ../mastra (brain) or this repo
 *                     (router persona / voice catalog), per judge reasoning
 *   capability_gap  → product Ticket (requires --product)
 *
 * GATED on the calibration gate (decision 9): a closed gate files nothing.
 * --override-gate exists for testing only. Idempotent via
 * ThreadScore.filedAt — re-runs file nothing new. Near-identical failures
 * collapse into one filing with example Threads.
 *
 * Usage:
 *   npm run file-failures -- --dry-run                  # preview, no writes
 *   npm run file-failures -- --product <cuid>           # file (local DB)
 *   npm run file-failures -- --product <cuid> --yes     # non-local DB host
 *   npm run file-failures -- --override-gate --dry-run  # testing only
 *
 * ⚠️  Writes filedAt/filedRef to the DB at DATABASE_URL and creates issues/
 * Tickets. Refuses non-local DB hosts unless --yes is passed.
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";

import { PrismaClient } from "@prisma/client";

import { fileFailures } from "../src/server/services/failureFilingService";
import { type Filing } from "../src/server/services/failureFiling";
import { JUDGE_VERSION } from "../src/server/services/AgentEvalService";
import { generateFunId } from "../src/lib/fun-ids";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

interface Args {
  dryRun: boolean;
  overrideGate: boolean;
  yes: boolean;
  productId?: string;
  userId?: string;
  mastraDir: string;
}

function parseArgs(argv: string[]): Args {
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
  return {
    dryRun: argv.includes("--dry-run"),
    overrideGate: argv.includes("--override-gate"),
    yes: argv.includes("--yes"),
    productId: value("--product"),
    userId: value("--user"),
    mastraDir: value("--mastra") ?? "../mastra",
  };
}

/** Create a beads issue via the bd CLI; returns "beads:<issue-id>". */
function fileBeadsIssue(filing: Filing, cwd: string): string {
  const issueType = filing.lane === "code_bug" ? "bug" : "task";
  // --silent outputs only the issue id — stable for scripting, unlike the
  // human-readable banner.
  const stdout = execFileSync(
    "bd",
    [
      "create",
      `--title=${filing.title}`,
      `--type=${issueType}`,
      "--priority=2",
      "--silent",
      "-d",
      filing.body,
    ],
    { cwd, encoding: "utf8" },
  );
  const issueId = stdout.trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(issueId)) {
    throw new Error(
      `bd create succeeded but output was not a bare issue id — ` +
        `the issue MAY ALREADY EXIST in ${cwd}; check before re-running:\n${stdout}`,
    );
  }
  return `beads:${issueId}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  let host = "(unparseable DATABASE_URL)";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    /* keep placeholder */
  }
  console.log(`Database host: ${host}`);
  if (!args.dryRun && !LOCAL_HOSTS.has(host) && !args.yes) {
    console.error(
      `Refusing to write to non-local database host "${host}" without --yes.\n` +
        "This script writes ThreadScore.filedAt/filedRef and creates Tickets. " +
        "Re-run with --yes if that is intended (or --dry-run to preview).",
    );
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    // Preflight destination preconditions before any filing happens, so a run
    // never crashes mid-loop with real side effects already behind it.
    if (!args.dryRun) {
      const unfiledByLane = (lane: string) =>
        db.threadScore.count({
          where: { failureLane: lane, filedAt: null, judgeVersion: JUDGE_VERSION },
        });
      const capabilityGaps = await unfiledByLane("capability_gap");
      if (capabilityGaps > 0 && !args.productId) {
        console.error(
          `${capabilityGaps} unfiled capability_gap failure(s) need a product Ticket — ` +
            "pass --product <cuid>.",
        );
        process.exitCode = 1;
        return;
      }
      const agentBehaviours = await unfiledByLane("agent_behaviour");
      if (agentBehaviours > 0 && !existsSync(args.mastraDir)) {
        console.error(
          `--mastra directory "${args.mastraDir}" does not exist — ` +
            "agent_behaviour filings may go there. Pass --mastra <path>.",
        );
        process.exitCode = 1;
        return;
      }
    }

    // Resolve who owns capability_gap Tickets we create.
    const resolveCreator = async (): Promise<string> => {
      if (args.userId) return args.userId;
      const admin = await db.user.findFirst({
        where: { isAdmin: true },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (!admin) {
        throw new Error("No --user given and no admin user found to own created Tickets.");
      }
      return admin.id;
    };

    const result = await fileFailures(db, {
      dryRun: args.dryRun,
      overrideGate: args.overrideGate,
      filers: {
        "exponential-beads": (filing) => Promise.resolve(fileBeadsIssue(filing, process.cwd())),
        "mastra-beads": (filing) => Promise.resolve(fileBeadsIssue(filing, args.mastraDir)),
        "product-ticket": async (filing) => {
          if (!args.productId) {
            throw new Error(
              "A capability_gap filing needs a product Ticket — pass --product <cuid>.",
            );
          }
          const createdById = await resolveCreator();
          // Mirrors the createTicket flow in src/server/api/routers/mastra.ts:
          // atomic counter increment, then optional fun short id.
          const updated = await db.product.update({
            where: { id: args.productId },
            data: { ticketCounter: { increment: 1 } },
            select: { ticketCounter: true, funTicketIds: true },
          });
          let shortId: string | null = null;
          if (updated.funTicketIds) {
            const existing = await db.ticket.findMany({
              where: { productId: args.productId },
              select: { shortId: true },
            });
            shortId = generateFunId(
              new Set(existing.map((t) => t.shortId).filter(Boolean) as string[]),
            );
          }
          const ticket = await db.ticket.create({
            data: {
              productId: args.productId,
              number: updated.ticketCounter,
              shortId,
              title: filing.title,
              body: filing.body,
              type: "FEATURE",
              status: "BACKLOG",
              createdById,
            },
          });
          return `ticket:${ticket.id}`;
        },
      },
    });

    console.log(
      `\nDone. Gate ${result.gate.calibrated ? "open" : "closed"}` +
        `${result.gateOverridden ? " (OVERRIDDEN)" : ""}; ` +
        `${result.unfiledCount} unfiled failure(s) → ${result.filed.length} filing(s).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("file-failures failed:", error);
  process.exit(1);
});
