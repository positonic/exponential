/**
 * file-failures — Level B lane-routed auto-filing (ADR-0012 decision 4).
 *
 * Takes scored, not-yet-filed failures and files each cluster as a
 * Ticket in the product given by --product, typed by its Failure lane:
 *
 *   code_bug        → BUG Ticket, fix in this repo
 *   agent_behaviour → BUG Ticket, fix in ../mastra (brain) or this repo
 *                     (router persona / voice catalog), per judge reasoning
 *   capability_gap  → FEATURE Ticket
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
 * ⚠️  Writes filedAt/filedRef to the DB at DATABASE_URL and creates Tickets.
 * Refuses non-local DB hosts unless --yes is passed.
 */
import { PrismaClient, type TicketType } from "@prisma/client";

import { fileFailures } from "../src/server/services/failureFilingService";
import { type Filing, type FilingDestination } from "../src/server/services/failureFiling";
import { JUDGE_VERSION } from "../src/server/services/AgentEvalService";
import { generateFunId } from "../src/lib/fun-ids";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

interface Args {
  dryRun: boolean;
  overrideGate: boolean;
  yes: boolean;
  productId?: string;
  userId?: string;
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
  };
}

/** Ticket type and "where the fix lives" note for each destination. */
const DESTINATION_TICKET: Record<FilingDestination, { type: TicketType; fixLives: string }> = {
  "app-bug": { type: "BUG", fixLives: "this repo (exponential-app: tRPC, tools, router persona)" },
  "mastra-bug": { type: "BUG", fixLives: "../mastra (Zoe's brain instructions)" },
  "capability-gap": { type: "FEATURE", fixLives: "a missing capability, not a bug" },
};

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
      const unfiled = await db.threadScore.count({
        where: { failureLane: { not: null }, filedAt: null, judgeVersion: JUDGE_VERSION },
      });
      if (unfiled > 0 && !args.productId) {
        console.error(
          `${unfiled} unfiled failure(s) are filed as Tickets — pass --product <cuid>.`,
        );
        process.exitCode = 1;
        return;
      }
    }

    // Resolve who owns the Tickets we create.
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

    const fileTicket = async (filing: Filing): Promise<string> => {
      if (!args.productId) {
        throw new Error("Filing needs a product — pass --product <cuid>.");
      }
      const { type, fixLives } = DESTINATION_TICKET[filing.destination];
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
          body: `**Where the fix lives:** ${fixLives}\n\n${filing.body}`,
          type,
          status: "BACKLOG",
          createdById,
        },
      });
      return `ticket:${ticket.id}`;
    };

    const result = await fileFailures(db, {
      dryRun: args.dryRun,
      overrideGate: args.overrideGate,
      filers: {
        "app-bug": fileTicket,
        "mastra-bug": fileTicket,
        "capability-gap": fileTicket,
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
