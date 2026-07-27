/**
 * Public interface of the transcript parser registry (ADR-0032).
 *
 * The surface is intentionally tiny and rarely-changing:
 * - `parseTranscript(input)` → canonical `TranscriptTurn[]`
 * - `turnsToReadableText(turns)` → speaker-prefixed text for the summarizer feed
 *
 * Everything else (individual parsers, the ordered registry) is exported for
 * tests and future extension but callers should prefer the two functions above.
 */
export type {
  TranscriptFlavor,
  TranscriptInput,
  TranscriptParser,
  TranscriptParticipant,
  TranscriptTurn,
} from "./types";

export { parseTranscript, TRANSCRIPT_PARSERS } from "./registry";
export { turnsToReadableText } from "./readable";
export { firefliesParser } from "./fireflies";
export { labelledTurnsParser } from "./labelled-turns";
export { rawParser } from "./raw";
