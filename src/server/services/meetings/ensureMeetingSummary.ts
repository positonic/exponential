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

/**
 * The one place a meeting transcript becomes a persisted summary.
 *
 * Every trigger — the hourly auto-summarize cron sweep, the manual
 * `generateSummary` mutation, and the on-view (detail/list) triggers — funnels
 * through here so there is a single summarization path: extract the readable
 * transcript, summarize it via {@link TranscriptSummarizerService} into the
 * Fireflies-shaped JSON the UI already renders, persist it, and emit one
 * `meeting`/`summarized` activity event when a summary first lands.
 *
 * Idempotent by default: the persist is guarded on `summary IS NULL`, so two
 * concurrent triggers can't double-write or double-emit. The activity event is
 * emitted only when a summary transitions null → value, never on a re-summarize
 * or overwrite.
 */

/** The columns the summarizer needs from a `TranscriptionSession` row. */
export interface SummarizableMeetingRow {
  id: string;
  title: string | null;
  transcription: string | null;
  summary: string | null;
  workspaceId: string | null;
  userId: string | null;
}

export type EnsureMeetingSummaryStatus =
  /** A summary was generated and persisted on this call. */
  | "created"
  /** The meeting already had a summary (or a concurrent writer won the race). */
  | "already-had"
  /** No usable transcript to summarize. */
  | "no-transcript"
  /** Summarization isn't configured (missing OPENAI_API_KEY). */
  | "not-configured"
  /** The meeting row could not be found. */
  | "not-found";

export interface EnsureMeetingSummaryResult {
  status: EnsureMeetingSummaryStatus;
  /** The persisted summary JSON, present when status is `created`. */
  summary?: string;
  /** True when a `meeting`/`summarized` activity event was written. */
  eventEmitted: boolean;
}

export interface SummarizeMeetingOptions {
  /**
   * Re-summarize and overwrite an existing summary instead of treating a
   * present summary as `already-had`. Only the explicit manual mutation sets
   * this; the cron sweep and view triggers leave it false so they never clobber
   * a summary a user may have hand-edited.
   */
  overwriteExisting?: boolean;
}

/**
 * Summarize an already-fetched meeting row and persist the result. Never throws
 * for per-meeting failures (transcript empty, LLM error) — those resolve to a
 * status the caller can act on — so a single bad transcript can't sink a batch.
 *
 * Access control is the CALLER's responsibility: this is a trusted server-side
 * primitive (the cron sweep has no user to authorize against).
 */
export async function summarizeMeetingRow(
  db: PrismaClient,
  meeting: SummarizableMeetingRow,
  options: SummarizeMeetingOptions = {},
): Promise<EnsureMeetingSummaryResult> {
  const wasUnsummarized =
    typeof meeting.summary !== "string" || meeting.summary.trim().length === 0;

  if (!wasUnsummarized && !options.overwriteExisting) {
    return { status: "already-had", eventEmitted: false };
  }

  const transcriptText = extractReadableTranscript(meeting.transcription);
  if (transcriptText.trim().length === 0) {
    return { status: "no-transcript", eventEmitted: false };
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
      return { status: "not-configured", eventEmitted: false };
    }
    console.error(
      "[ensureMeetingSummary] failed to summarize meeting",
      meeting.id,
      error instanceof Error ? error.message : String(error),
    );
    return { status: "no-transcript", eventEmitted: false };
  }

  // Conditional persist guards against a concurrent writer having filled
  // `summary` since we read the row — `updateMany` with `summary: null` makes
  // the write a no-op in that case, so we never overwrite or double-emit. When
  // overwriting explicitly, drop the guard.
  if (options.overwriteExisting && !wasUnsummarized) {
    await db.transcriptionSession.update({
      where: { id: meeting.id },
      data: { summary: summaryJson, updatedAt: new Date() },
    });
    // Overwrite of an existing summary is not a "first summary" — no event.
    return { status: "created", summary: summaryJson, eventEmitted: false };
  }

  const { count } = await db.transcriptionSession.updateMany({
    where: { id: meeting.id, summary: null },
    data: { summary: summaryJson, updatedAt: new Date() },
  });
  if (count === 0) {
    return { status: "already-had", eventEmitted: false };
  }

  // Emit one activity event per summary that first lands. Skipped for personal
  // (no-workspace) meetings since recordActivity requires a workspaceId; the
  // title rides in metadata so the feed renders the title, not a CUID.
  let eventEmitted = false;
  if (meeting.workspaceId && meeting.userId) {
    eventEmitted = await recordActivity(db, {
      workspaceId: meeting.workspaceId,
      userId: meeting.userId,
      entityType: "meeting",
      entityId: meeting.id,
      action: "summarized",
      metadata: { title: meeting.title ?? undefined },
    });
  }

  return { status: "created", summary: summaryJson, eventEmitted };
}

/**
 * Fetch a meeting by id and ensure it has a summary. The by-id wrapper for
 * single-meeting callers (the manual mutation, the on-view detail trigger).
 * Returns `not-found` when the id doesn't resolve.
 */
export async function ensureMeetingSummary(
  db: PrismaClient,
  meetingId: string,
  options: SummarizeMeetingOptions = {},
): Promise<EnsureMeetingSummaryResult> {
  const meeting = await db.transcriptionSession.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      transcription: true,
      summary: true,
      workspaceId: true,
      userId: true,
    },
  });

  if (!meeting) {
    return { status: "not-found", eventEmitted: false };
  }

  return summarizeMeetingRow(db, meeting, options);
}
