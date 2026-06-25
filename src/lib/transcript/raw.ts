import { stripScreenshots } from "./strip";
import type { TranscriptParser } from "./types";

/**
 * Terminal fallback: a transcript we could not structure becomes one
 * speaker-less, flavor-null turn. Never invents a speaker. Empty or
 * whitespace-only input yields no turns at all.
 */
export const rawParser: TranscriptParser = {
  name: "raw",

  // Always the last resort — it accepts anything and decides emptiness in parse.
  canParse() {
    return true;
  },

  parse(input) {
    if (typeof input.transcription !== "string") return [];
    const text = stripScreenshots(input.transcription).trim();
    if (text.length === 0) return [];
    return [{ text, speaker: null, flavor: null, startTime: null }];
  },
};
