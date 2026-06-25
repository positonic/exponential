import { parseTranscript, turnsToReadableText } from "~/lib/transcript";

/**
 * Normalize a stored `transcription` field into readable plain text for the
 * summarizer, via the shared transcript parser (ADR-0032). Fireflies `{ sentences }`
 * blobs and device plain-text pastes both normalize to canonical turns, then
 * serialize to speaker-prefixed lines. Returns "" when there's nothing to
 * summarize.
 *
 * For Fireflies blobs this is byte-equivalent to the previous
 * `FirefliesService.formatTranscriptText` output; for `Me:`/`Them:` pastes it is
 * intentionally cleaner — meeting header lines (`Meeting Title:`, `Date:`, …) and
 * `[SCREENSHOT]` markers are dropped rather than fed to the summarizer.
 *
 * Shared by the transcription router's `generateSummary` mutation and the
 * auto-summarize cron sweep so both produce summaries from identical input.
 */
export function extractReadableTranscript(raw: string | null): string {
  return turnsToReadableText(
    parseTranscript({ transcription: raw, sentencesJson: null, participants: [] }),
  );
}

/** Max transcript chars fed to the summarizer (cost/latency bound). */
export const MAX_SUMMARY_TRANSCRIPT_CHARS = 200_000;
