import type { TranscriptTurn } from "./types";

/**
 * Re-serialize canonical turns into the readable, speaker-prefixed text the
 * summarizer feed expects (`Name: text` per line, plain text for speaker-less
 * turns). This is the single source of truth that retires the duplicate
 * JSON-sniffing in `extractReadableTranscript`.
 */
export function turnsToReadableText(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => (turn.speaker ? `${turn.speaker}: ${turn.text}` : turn.text))
    .join("\n");
}
