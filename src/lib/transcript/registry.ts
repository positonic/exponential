import { firefliesParser } from "./fireflies";
import { labelledTurnsParser } from "./labelled-turns";
import { rawParser } from "./raw";
import type { TranscriptInput, TranscriptParser, TranscriptTurn } from "./types";

/**
 * Priority-ordered parser registry. Detection is content-driven, so the order
 * is the precedence: a Fireflies JSON blob is claimed by `fireflies` before it
 * can reach `labelled-turns`. Adding a future tool (Otter/Whisper/…) is one new
 * entry here.
 */
export const TRANSCRIPT_PARSERS: readonly TranscriptParser[] = [
  firefliesParser,
  labelledTurnsParser,
  rawParser,
];

/**
 * Normalize any stored transcript into the canonical `TranscriptTurn[]`. The
 * first parser whose `canParse` returns `true` wins; `rawParser` always matches,
 * so the loop resolves.
 */
export function parseTranscript(input: TranscriptInput): TranscriptTurn[] {
  for (const parser of TRANSCRIPT_PARSERS) {
    if (parser.canParse(input)) {
      return parser.parse(input);
    }
  }
  return [];
}
