import type { PrismaClient } from "@prisma/client";
import { summarizeMeetingRow } from "~/server/services/meetings/ensureMeetingSummary";
import {
  selectMeetingsToSummarize,
  type SummarizableMeeting,
} from "~/server/services/meetings/selectMeetingsToSummarize";

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
 *   3. emits one `meeting`/`summarized` activity event per summary that lands.
 *
 * Idempotent: it only ever picks up `summary IS NULL` rows, so re-running is
 * safe and never double-emits the `summarized` event for an already-summarised
 * meeting. Meetings still lacking a summary (no transcript, or a failed/skipped
 * summarize) are simply left for the next sweep — downstream consumers fall back
 * to title.
 */

/** Default number of meetings summarized per sweep (bounds LLM cost/runtime). */
const DEFAULT_SWEEP_LIMIT = 10;

/** The columns the sweep needs from a `TranscriptionSession` row. */
interface SweepMeeting extends SummarizableMeeting {
  title: string | null;
  workspaceId: string | null;
  userId: string | null;
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
  const { userId } = options;

  const result: MeetingSummarySweepResult = {
    candidates: 0,
    summarized: 0,
    skipped: 0,
    eventsEmitted: 0,
    notConfigured: false,
  };

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
    const outcome = await summarizeMeetingRow(db, meeting);

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
      // no-transcript / already-had (concurrent writer won the race).
      result.skipped += 1;
    }
  }

  return result;
}
