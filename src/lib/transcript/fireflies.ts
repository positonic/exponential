import { createFlavorAssigner, hostNamesOf } from "./flavor";
import type { TranscriptInput, TranscriptParser, TranscriptTurn } from "./types";

interface RawSentence {
  text: string;
  speakerName: string | null;
  startTime: number | null;
}

/** Coerce an unknown array into the Fireflies sentence shape we care about. */
function coerceSentences(arr: unknown[]): RawSentence[] {
  const rows: RawSentence[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    if (typeof obj.text !== "string") continue;
    rows.push({
      text: obj.text,
      speakerName:
        typeof obj.speaker_name === "string" ? obj.speaker_name : null,
      startTime: typeof obj.start_time === "number" ? obj.start_time : null,
    });
  }
  return rows;
}

/**
 * Find the best available Fireflies sentence array: prefer the structured
 * `sentencesJson` field, fall back to a `{ sentences: [...] }` JSON blob stored
 * in `transcription`. Returns `null` when neither yields a usable sentence.
 */
function extractSentences(input: TranscriptInput): RawSentence[] | null {
  if (Array.isArray(input.sentencesJson)) {
    const rows = coerceSentences(input.sentencesJson);
    if (rows.length > 0) return rows;
  }

  if (typeof input.transcription === "string") {
    const trimmed = input.transcription.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { sentences?: unknown }).sentences)
        ) {
          const rows = coerceSentences(
            (parsed as { sentences: unknown[] }).sentences,
          );
          if (rows.length > 0) return rows;
        }
      } catch {
        /* not JSON — not a Fireflies transcript */
      }
    }
  }

  return null;
}

/**
 * Structured transcripts (Fireflies and anything sharing its `sentences[]`
 * shape): named, timestamped turns, one per sentence. Flavor comes from the
 * host/participant mapping.
 */
export const firefliesParser: TranscriptParser = {
  name: "fireflies",

  canParse(input) {
    return extractSentences(input) !== null;
  },

  parse(input) {
    const sentences = extractSentences(input);
    if (!sentences) return [];

    const assignFlavor = createFlavorAssigner(hostNamesOf(input.participants));

    return sentences.map((s): TranscriptTurn => {
      const speaker = s.speakerName;
      return {
        text: s.text,
        speaker,
        flavor: speaker ? assignFlavor(speaker) : null,
        startTime: s.startTime,
      };
    });
  },
};
