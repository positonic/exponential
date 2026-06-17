import {
  FirefliesService,
  type FirefliesTranscript,
} from "~/server/services/FirefliesService";

/**
 * Normalize a stored `transcription` field into readable plain text for the
 * summarizer. Fireflies sessions store a JSON `{ sentences: [...] }` blob;
 * device sessions store plain text. Returns "" when there's nothing to
 * summarize.
 *
 * Shared by the transcription router's `generateSummary` mutation and the
 * auto-summarize cron sweep so both produce summaries from identical input.
 */
export function extractReadableTranscript(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const sentences =
        parsed && typeof parsed === "object" && "sentences" in parsed
          ? (parsed as { sentences?: FirefliesTranscript["sentences"] })
              .sentences
          : undefined;
      if (sentences?.length) {
        return FirefliesService.formatTranscriptText(sentences);
      }
    } catch {
      // Not JSON — fall through and treat the raw string as plain text.
    }
  }

  return trimmed;
}

/** Max transcript chars fed to the summarizer (cost/latency bound). */
export const MAX_SUMMARY_TRANSCRIPT_CHARS = 200_000;
