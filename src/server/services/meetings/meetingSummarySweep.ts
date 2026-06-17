import type { PrismaClient } from "@prisma/client";
import {
  TranscriptSummarizerService,
  SummarizationNotConfiguredError,
} from "~/server/services/TranscriptSummarizerService";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  extractReadableTranscript,
  MAX_SUMMARY_TRANSCRIPT_CHARS,
} from "~/server/services/meetings/extractReadableTranscript";
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
    const transcriptText = extractReadableTranscript(meeting.transcription);
    if (transcriptText.trim().length === 0) {
      result.skipped += 1;
      continue;
    }

    let summaryJson: string;
    try {
      const summary =
        await TranscriptSummarizerService.summarizeToFirefliesSummary(
          transcriptText.slice(0, MAX_SUMMARY_TRANSCRIPT_CHARS),
        );
      summaryJson = JSON.stringify(summary, null, 2);
    } catch (error) {
      if (error instanceof SummarizationNotConfiguredError) {
        // No key configured — abort the whole sweep cleanly; nothing here will
        // succeed and the next sweep heals once it's configured.
        result.notConfigured = true;
        break;
      }
      console.error(
        "[meetingSummarySweep] failed to summarize meeting",
        meeting.id,
        error instanceof Error ? error.message : String(error),
      );
      result.skipped += 1;
      continue;
    }

    // Conditional persist guards against a concurrent writer (e.g. the manual
    // generateSummary mutation) having filled `summary` since we read the row —
    // `updateMany` with `summary: null` makes the write a no-op in that case, so
    // we never overwrite a summary or double-emit the activity event.
    const { count } = await db.transcriptionSession.updateMany({
      where: { id: meeting.id, summary: null },
      data: { summary: summaryJson, updatedAt: new Date() },
    });
    if (count === 0) {
      result.skipped += 1;
      continue;
    }
    result.summarized += 1;

    // Emit one activity event per summary that lands. Skipped for personal
    // (no-workspace) meetings since recordActivity requires a workspaceId; the
    // title rides in metadata so the feed renders the title, not a CUID.
    if (meeting.workspaceId && meeting.userId) {
      const wrote = await recordActivity(db, {
        workspaceId: meeting.workspaceId,
        userId: meeting.userId,
        entityType: "meeting",
        entityId: meeting.id,
        action: "summarized",
        metadata: { title: meeting.title ?? undefined },
      });
      if (wrote) result.eventsEmitted += 1;
    }
  }

  return result;
}
