/**
 * Pure selector for the auto-summarize cron sweep (ADR-0018, royal.raven).
 *
 * Given a batch of meeting rows, decide which ones the sweep should summarize:
 * a meeting is eligible iff it has a transcript to summarize but no summary yet.
 * Everything else — already-summarised meetings and transcript-less ones — is
 * skipped, which is what makes the sweep safe to re-run (idempotent) and lets it
 * "heal forward" without mass-backfilling.
 *
 * This is intentionally a free function with no DB or IO so it can be unit
 * tested in isolation (prior art: recordActivity.test.ts / heatmap.test.ts).
 * The narrow input shape (`SummarizableMeeting`) is a structural subset of
 * `TranscriptionSession`, so the sweep service can pass real rows directly.
 */

/** The minimal meeting shape the selector reasons about. */
export interface SummarizableMeeting {
  id: string;
  /** Raw transcript blob (Fireflies JSON or device plain text), or null. */
  transcription: string | null;
  /** Persisted summary; null/empty means "not summarised yet". */
  summary: string | null;
}

/** Returns true when the transcript field holds something worth summarizing. */
function hasTranscript(transcription: string | null): boolean {
  return typeof transcription === "string" && transcription.trim().length > 0;
}

/** Returns true when the meeting already has a non-empty summary. */
function hasSummary(summary: string | null): boolean {
  return typeof summary === "string" && summary.trim().length > 0;
}

/**
 * Filter `meetings` down to the ones the sweep should summarize:
 * transcript present AND summary absent. Order is preserved.
 *
 * Pure: no mutation, no IO. Safe to call on every sweep — already-summarised
 * rows fall out here, so the sweep never double-summarizes or double-emits the
 * `meeting`/`summarized` activity event.
 */
export function selectMeetingsToSummarize<T extends SummarizableMeeting>(
  meetings: readonly T[],
): T[] {
  return meetings.filter(
    (m) => hasTranscript(m.transcription) && !hasSummary(m.summary),
  );
}
