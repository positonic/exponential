/**
 * eval-extraction — score the meeting "Extract outputs" pipeline against what
 * people already confirmed and rejected on the Outputs tab.
 *
 * Two steps, kept apart so a prompt can be tried many times against one
 * frozen set of meetings:
 *
 *   1. Export (reads the database, never writes; the connection is opened
 *      read-only). Every meeting with at least one reviewed decision or open
 *      question is written to a local, git-ignored folder with its transcript,
 *      notes and labels:
 *
 *        DATABASE_URL=... npm run eval-extraction -- --export
 *
 *   2. Run. Each exported meeting is read again by whatever extraction code
 *      and prompt this working tree has, and the candidates are scored:
 *
 *        npm run eval-extraction -- --label main --save .eval/extraction/main.json
 *        npm run eval-extraction -- --label my-prompt --baseline .eval/extraction/main.json
 *
 * Options for a run:
 *   --data <dir>        exported meetings (default .eval/extraction/meetings)
 *   --label <name>      what to call this run in the report
 *   --model <id>        model to extract with (default LLM_MODEL, else gpt-4o)
 *   --meeting <id>      run one meeting only (repeatable)
 *   --save <file>       save the scored run as JSON, to use as a baseline later
 *   --baseline <file>   show the change from a saved run
 *   --report <file>     write the summary and the per-meeting detail as Markdown
 *
 * The run mirrors `generateDraftDecisions`: notes and summary first, each
 * backed by a transcript turn, then the transcript pass told what those
 * already hold. It differs in one way on purpose: it starts from an empty
 * decision log, so a result does not depend on what the workspace held on the
 * day the meeting was first read.
 *
 * A run needs OPENAI_API_KEY and nothing else: no database. The exported folder holds private meeting
 * transcripts: it is git-ignored, and it should stay on this machine.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { parseTranscript, type TranscriptTurn } from "../src/lib/transcript";
import {
  DEFAULT_MAX_DECISIONS,
  DecisionExtractionService,
  chunkTurns,
  extractNotesDecisionItems,
  filterNearDuplicateCandidates,
  findSupportingTurns,
  type DecisionCandidate,
} from "../src/server/services/DecisionExtractionService";
import { summaryDecisionText } from "../src/server/services/decisions/summaryDecisionText";
import {
  formatEvalReport,
  formatMeetingDetail,
  scoreMeeting,
  summariseScores,
  type EvalCandidate,
  type EvalLabel,
  type EvalRun,
  type MeetingScore,
} from "../src/server/services/meetings/extractionEval";

const DEFAULT_DATA_DIR = ".eval/extraction/meetings";

/** One exported meeting: what the extractor reads, and what people decided about its drafts. */
interface MeetingFixture {
  id: string;
  title: string | null;
  meetingDate: string | null;
  transcription: string | null;
  sentencesJson: unknown;
  notes: string | null;
  summary: string | null;
  participants: Array<{ name: string | null; speakerLabel: string | null }>;
  labels: EvalLabel[];
}

interface Args {
  export: boolean;
  dataDir: string;
  label: string;
  model?: string;
  meetings: string[];
  saveFile?: string;
  baselineFile?: string;
  reportFile?: string;
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
  const all = (flag: string): string[] =>
    argv.flatMap((arg, i) => (arg === flag && argv[i + 1] !== undefined ? [argv[i + 1]!] : []));
  return {
    export: argv.includes("--export"),
    dataDir: value("--data") ?? DEFAULT_DATA_DIR,
    label: value("--label") ?? "candidate",
    model: value("--model"),
    meetings: all("--meeting"),
    saveFile: value("--save"),
    baselineFile: value("--baseline"),
    reportFile: value("--report"),
  };
}

/** The database URL with the session forced read-only, whatever the role allows. */
function readOnlyUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const existing = url.searchParams.get("options");
  const readOnly = "-c default_transaction_read_only=on";
  url.searchParams.set("options", existing ? `${existing} ${readOnly}` : readOnly);
  return url.toString();
}

function evidenceTurnsOf(evidence: unknown): number[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== "object" || !("turnIndex" in entry)) return [];
    return typeof entry.turnIndex === "number" ? [entry.turnIndex] : [];
  });
}

async function exportMeetings(dataDir: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  console.log(`Database host: ${new URL(databaseUrl).hostname} (read-only export)`);

  const db = new PrismaClient({ datasources: { db: { url: readOnlyUrl(databaseUrl) } } });
  try {
    const meetings = await db.transcriptionSession.findMany({
      where: { decisions: { some: { reviewState: { in: ["CONFIRMED", "REJECTED"] } } } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        meetingDate: true,
        transcription: true,
        sentencesJson: true,
        notes: true,
        summary: true,
        participants: { select: { name: true, speakerLabel: true } },
        decisions: {
          where: { reviewState: { in: ["CONFIRMED", "REJECTED"] } },
          orderBy: { number: "asc" },
          select: { id: true, number: true, statement: true, status: true, reviewState: true, source: true, evidence: true },
        },
      },
    });

    mkdirSync(dataDir, { recursive: true });
    // An export replaces the set: a meeting whose labels were since reset, or
    // one from another database, must not linger and be scored on old labels.
    const exportedFiles = new Set(meetings.map((meeting) => `${meeting.id}.json`));
    for (const file of readdirSync(dataDir)) {
      if (file.endsWith(".json") && !exportedFiles.has(file)) rmSync(path.join(dataDir, file));
    }
    let labels = 0;
    for (const meeting of meetings) {
      const fixture: MeetingFixture = {
        id: meeting.id,
        title: meeting.title,
        meetingDate: meeting.meetingDate?.toISOString() ?? null,
        transcription: meeting.transcription,
        sentencesJson: meeting.sentencesJson,
        notes: meeting.notes,
        summary: meeting.summary,
        participants: meeting.participants,
        labels: meeting.decisions.map((d) => ({
          id: d.id,
          number: d.number,
          // An open question is a Decision in OPEN status (ADR-0060).
          kind: d.status === "OPEN" ? "question" : "decision",
          verdict: d.reviewState === "REJECTED" ? "rejected" : "confirmed",
          source: d.source,
          statement: d.statement,
          evidenceTurns: evidenceTurnsOf(d.evidence),
        })),
      };
      labels += fixture.labels.length;
      writeFileSync(path.join(dataDir, `${meeting.id}.json`), JSON.stringify(fixture, null, 2));
    }
    console.log(`Exported ${meetings.length} meeting(s) with ${labels} label(s) to ${dataDir}`);
  } finally {
    await db.$disconnect();
  }
}

function loadFixtures(args: Args): MeetingFixture[] {
  if (!existsSync(args.dataDir)) {
    console.error(`No exported meetings at ${args.dataDir}. Run with --export first.`);
    process.exit(1);
  }
  const fixtures = readdirSync(args.dataDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(args.dataDir, file), "utf8")) as MeetingFixture);
  return args.meetings.length > 0 ? fixtures.filter((f) => args.meetings.includes(f.id)) : fixtures;
}

const toEvalCandidate = (candidate: DecisionCandidate): EvalCandidate => ({
  kind: candidate.isOpenQuestion ? "question" : "decision",
  statement: candidate.statement,
  evidenceTurns: candidate.evidence.map((turn) => turn.turnIndex),
  origin: candidate.origin,
});

/**
 * One meeting through the extraction pipeline, from an empty decision log.
 * Keep in step with `generateDraftDecisions`: this is the same order of
 * passes and the same filters, without the database writes around them.
 */
async function extractCandidates(
  fixture: MeetingFixture,
  modelName: string,
): Promise<{ candidates: EvalCandidate[]; sectionsTotal: number; sectionsUnread: number }> {
  const turns: TranscriptTurn[] = parseTranscript({
    transcription: fixture.transcription,
    sentencesJson: fixture.sentencesJson,
    participants: fixture.participants,
  });
  const notesText = fixture.notes?.trim() ?? "";

  const notesCandidates: DecisionCandidate[] = [];
  const captured = () => ({
    decisions: notesCandidates.filter((c) => !c.isOpenQuestion).map((c) => c.statement),
    questions: notesCandidates.filter((c) => c.isOpenQuestion).map((c) => c.statement),
  });
  const backWithEvidence = (raw: DecisionCandidate[]) => {
    for (const candidate of raw) {
      if (notesCandidates.length >= DEFAULT_MAX_DECISIONS) break;
      if (filterNearDuplicateCandidates([candidate], captured()).length === 0) continue;
      if (turns.length === 0) {
        notesCandidates.push({ ...candidate, evidence: [] });
        continue;
      }
      const evidence = findSupportingTurns(candidate.statement, turns);
      if (evidence.length > 0) notesCandidates.push({ ...candidate, evidence });
    }
  };
  if (notesText) {
    backWithEvidence(await DecisionExtractionService.extractFromNotes(notesText, { modelName }));
  }
  const summaryText = summaryDecisionText(fixture.summary);
  if (summaryText) backWithEvidence(extractNotesDecisionItems(summaryText));

  let transcriptCandidates: DecisionCandidate[] = [];
  let sectionsTotal = 0;
  let sectionsUnread = 0;
  const remainingBudget = Math.max(0, DEFAULT_MAX_DECISIONS - notesCandidates.length);
  if (turns.length > 0 && remainingBudget > 0) {
    const alreadyCaptured = captured();
    const run = await DecisionExtractionService.extractFromTranscript(turns, {
      existingStatements: alreadyCaptured.decisions,
      existingQuestions: alreadyCaptured.questions,
      maxDecisions: remainingBudget,
      modelName,
    });
    transcriptCandidates = filterNearDuplicateCandidates(run.candidates, alreadyCaptured);
    sectionsTotal = run.chunksTotal;
    sectionsUnread = run.chunksSkipped + run.chunksFailed;
  } else if (turns.length > 0) {
    // The notes and summary used the whole decision budget, so the transcript
    // pass never ran: every section of the transcript went unread.
    sectionsTotal = chunkTurns(turns).length;
    sectionsUnread = sectionsTotal;
  }

  return {
    candidates: [...notesCandidates, ...transcriptCandidates].map(toEvalCandidate),
    sectionsTotal,
    sectionsUnread,
  };
}

async function runEval(args: Args): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set");
    process.exit(1);
  }
  const fixtures = loadFixtures(args);
  if (fixtures.length === 0) {
    console.error("No meetings to run.");
    process.exit(1);
  }
  const model = args.model ?? process.env.LLM_MODEL ?? "gpt-4o";

  // The extractor logs every section; keep the terminal for the eval's own lines.
  const log = console.log;
  const scores: MeetingScore[] = [];
  for (const [i, fixture] of fixtures.entries()) {
    const title = fixture.title ?? "Untitled";
    console.log = () => undefined;
    let extracted;
    try {
      extracted = await extractCandidates(fixture, model);
    } finally {
      console.log = log;
    }
    const score = scoreMeeting({ meetingId: fixture.id, title, labels: fixture.labels, ...extracted });
    scores.push(score);
    log(
      `[${i + 1}/${fixtures.length}] ${title}: found ${score.confirmedFound}/${score.confirmed} confirmed, repeated ${score.rejectedRepeated}/${score.rejected} rejected, ${score.unlabelled.length} unjudged`,
    );
  }

  const run: EvalRun = {
    label: args.label,
    model,
    ranAt: new Date().toISOString(),
    summary: summariseScores(scores),
    scores,
  };
  const baseline = args.baselineFile ? (JSON.parse(readFileSync(args.baselineFile, "utf8")) as EvalRun) : undefined;
  const report = formatEvalReport(run, baseline);
  console.log(`\n${report}\n`);

  if (args.saveFile) {
    mkdirSync(path.dirname(args.saveFile), { recursive: true });
    writeFileSync(args.saveFile, JSON.stringify(run, null, 2));
    console.log(`Saved run to ${args.saveFile}`);
  }
  if (args.reportFile) {
    mkdirSync(path.dirname(args.reportFile), { recursive: true });
    writeFileSync(args.reportFile, [report, "", ...scores.map(formatMeetingDetail)].join("\n\n"));
    console.log(`Wrote report to ${args.reportFile}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.export) {
    await exportMeetings(args.dataDir);
    return;
  }
  await runEval(args);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
