import type { PrismaClient } from "@prisma/client";
import { summarizeMeetingRow } from "~/server/services/meetings/ensureMeetingSummary";
import {
  selectMeetingsToSummarize,
  type SummarizableMeeting,
} from "~/server/services/meetings/selectMeetingsToSummarize";
import { attachUnlinkedMeetings } from "~/server/services/ceremonies/autoAttach";

/**
 * Auto-summarize cron sweep (ADR-0018, royal.raven).
 *
 * Runs serverless-safe inside a Vercel cron request — all work happens within
 * the request, never as post-response fire-and-forget. The sweep:
 *   1. selects meetings with a transcript but no summary (heals forward; no
 *      mass backfill of historical meetings),
 *   2. summarizes each via the existing `TranscriptSummarizerService` and
 *      persists the result to `summary` in the same shape as the manual
 *      `generateSummary` mutation,
 *   3. emits one `meeting`/`summarized` activity event per summary that lands,
 *   4. requests post-summary decision extraction (ADR-0060) for workspaces
 *      that have opted in — the only automatic route to draft decisions —
 *      while the run is within its extraction time budget.
 *
 * Idempotent: it only ever picks up `summary IS NULL` rows, so re-running is
 * safe and never double-emits the `summarized` event for an already-summarised
 * meeting. Meetings still lacking a summary (no transcript, or a failed/skipped
 * summarize) are simply left for the next sweep — downstream consumers fall back
 * to title.
 */

/** Default number of meetings summarized per sweep (bounds LLM cost/runtime). */
const DEFAULT_SWEEP_LIMIT = 10;

/**
 * How far into a sweep decision extraction is still requested. The cron runs
 * in a 300s function; past this point the remaining meetings are summarized
 * without extraction so a timeout can't strand summaries the `summary IS NULL`
 * selector would never revisit. Drafts skipped this way stay recoverable
 * from the summary tab's "Extract decisions" chip.
 */
const DEFAULT_EXTRACTION_BUDGET_MS = 180_000;

/** The columns the sweep needs from a `TranscriptionSession` row. */
interface SweepMeeting extends SummarizableMeeting {
  title: string | null;
  workspaceId: string | null;
  userId: string | null;
  occurrenceId: string | null;
}

export interface MeetingSummarySweepOptions {
  /** Max meetings to summarize in one sweep. Defaults to {@link DEFAULT_SWEEP_LIMIT}. */
  limit?: number;
  /**
   * Restrict the sweep to one user's meetings. The hourly cron leaves this
   * unset (sweeps the whole corpus); the on-view list trigger sets it to the
   * current user so a page load only heals that user's own meetings.
   */
  userId?: string;
  /**
   * Elapsed-time budget for requesting decision extraction (ADR-0060).
   * Defaults to {@link DEFAULT_EXTRACTION_BUDGET_MS}; callers running under
   * a tighter function limit (the on-view tRPC trigger) pass a smaller one.
   * `0` disables extraction for the run.
   */
  extractionBudgetMs?: number;
}

export interface MeetingSummarySweepResult {
  /** Eligible meetings the selector returned for this sweep. */
  candidates: number;
  /** Meetings whose summary was generated and persisted. */
  summarized: number;
  /** Meetings that yielded no usable summary (empty transcript, LLM error). */
  skipped: number;
  /** `meeting`/`summarized` activity events successfully written. */
  eventsEmitted: number;
  /** True when summarization is not configured (missing OPENAI_API_KEY). */
  notConfigured: boolean;
  /** Ceremony catch-up (ADR-0059): recent unattached meetings re-matched. */
  ceremonyCatchUp: { scanned: number; attached: number };
}

/**
 * Run one auto-summarize sweep. Resolves with a per-run tally; never throws for
 * per-meeting failures (those are logged and counted as skipped) so a single bad
 * transcript can't sink the whole sweep. A missing OPENAI_API_KEY short-circuits
 * the run cleanly via `notConfigured`.
 */
export async function runMeetingSummarySweep(
  db: PrismaClient,
  options: MeetingSummarySweepOptions = {},
): Promise<MeetingSummarySweepResult> {
  const limit = options.limit ?? DEFAULT_SWEEP_LIMIT;
  const extractionBudgetMs = options.extractionBudgetMs ?? DEFAULT_EXTRACTION_BUDGET_MS;
  const { userId } = options;
  const sweepStartedAt = Date.now();

  const result: MeetingSummarySweepResult = {
    candidates: 0,
    summarized: 0,
    skipped: 0,
    eventsEmitted: 0,
    notConfigured: false,
    ceremonyCatchUp: { scanned: 0, attached: 0 },
  };

  // Ceremony catch-up first (cheap, no LLM): rows created before their
  // ceremony existed get a second chance to attach by alias. Its own errors
  // are reported inside and never sink the sweep.
  result.ceremonyCatchUp = await attachUnlinkedMeetings(db, { userId });

  // DB-level prefilter mirrors the selector predicate (summary-null +
  // transcript-present) so we only pull rows that could be eligible. Archived
  // meetings are excluded — they're out of the active corpus.
  const rows: SweepMeeting[] = await db.transcriptionSession.findMany({
    where: {
      summary: null,
      transcription: { not: null },
      archivedAt: null,
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      transcription: true,
      summary: true,
      workspaceId: true,
      userId: true,
      occurrenceId: true,
    },
  });

  // Pure selector is the authoritative gate (also drops empty-string/whitespace
  // transcripts that the SQL `not null` check lets through).
  const eligible = selectMeetingsToSummarize(rows);
  result.candidates = eligible.length;

  for (const meeting of eligible) {
    // Single shared summarization path (cron, manual mutation, on-view triggers
    // all funnel through summarizeMeetingRow). Per-meeting failures resolve to a
    // status rather than throwing, so one bad transcript can't sink the sweep.
    // Decision extraction (ADR-0060) is requested here and gated per workspace
    // inside; it only runs on the first summary landing, never on `already-had`.
    // Once the run is deep into its function budget, stop requesting it so the
    // remaining meetings still get summarized before a timeout.
    const outcome = await summarizeMeetingRow(db, meeting, {
      extractDecisions: Date.now() - sweepStartedAt < extractionBudgetMs,
    });

    if (outcome.status === "not-configured") {
      // No key configured — abort the whole sweep cleanly; nothing here will
      // succeed and the next sweep heals once it's configured.
      result.notConfigured = true;
      break;
    }

    if (outcome.status === "created") {
      result.summarized += 1;
      if (outcome.eventEmitted) result.eventsEmitted += 1;
    } else {
      // no-transcript / failed (logged; retried next sweep since summary stays
      // null) / already-had (concurrent writer won the race).
      result.skipped += 1;
    }
  }

  return result;
}
