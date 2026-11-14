import { createFlavorAssigner, hostNamesOf } from "./flavor";
import { stripScreenshots } from "./strip";
import type { TranscriptParser, TranscriptTurn } from "./types";

/**
 * Header/metadata keys a manually pasted transcript commonly puts at the top as
 * `Key: value` lines. These look like speaker labels but are NOT speakers — drop
 * them so header lines never become bogus Speakers (CONTEXT.md → Speaker). The
 * list is deliberately a *known-key allowlist*: an unknown leading `Foo: bar`
 * line is treated as a real opening turn, never eaten.
 */
const META_HEADER_KEYS: ReadonlySet<string> = new Set([
  "meeting title",
  "title",
  "date",
  "time",
  "meeting participants",
  "participants",
  "attendees",
  "summary",
  "transcript",
  "notes",
  "agenda",
  "location",
  "duration",
]);

/** `Name: ` at the start of a line. Labels start with a letter, may contain a
 *  few inner words, and stop at the first colon (the class excludes `:`). */
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9 .'’-]{0,40}):\s*/;

/** `[m:ss]` or `[h:mm:ss]` at the start of a line, the shape Granola writes
 *  (`[12:07] Microphone: text`). Minutes run past 59 in the two-part form. */
const TIMESTAMP_RE = /^\[(\d{1,4}):([0-5]\d)(?::([0-5]\d))?\]\s*/;

interface ParsedLine {
  /** Seconds from the start of the recording, or `null` without a timestamp. */
  startTime: number | null;
  hasTimestamp: boolean;
  /** The speaker label, or `null` when the line carries none. */
  label: string | null;
  /** The line without its timestamp and label. */
  text: string;
}

/** Read the optional leading timestamp and the optional speaker label of a line. */
function parseLine(line: string): ParsedLine {
  const stamp = TIMESTAMP_RE.exec(line);
  const rest = stamp ? line.slice(stamp[0].length) : line;
  let startTime: number | null = null;
  if (stamp) {
    const [first, second, third] = [Number(stamp[1]), Number(stamp[2]), stamp[3]];
    startTime = third === undefined ? first * 60 + second : first * 3600 + second * 60 + Number(third);
  }
  const match = SPEAKER_RE.exec(rest);
  return {
    startTime,
    hasTimestamp: stamp !== null,
    label: match ? match[1]!.trim() : null,
    text: (match ? rest.slice(match[0].length) : rest).trim(),
  };
}

function isMetaLabel(label: string): boolean {
  return META_HEADER_KEYS.has(label.trim().toLowerCase());
}

/**
 * Drop everything at and above a standalone `Transcript:` marker line. Header
 * blocks live above this marker, so cutting there removes them wholesale; if
 * there is no marker, nothing is cut and the meta-key allowlist still guards.
 */
function stripAboveTranscriptMarker(lines: string[]): string[] {
  const markerIdx = lines.findIndex((l) => /^transcript\s*:\s*$/i.test(l.trim()));
  return markerIdx >= 0 ? lines.slice(markerIdx + 1) : lines;
}

/** Lines to consider for turn parsing, after screenshot + header stripping. */
function turnLines(transcription: string): string[] {
  const cleaned = stripScreenshots(transcription);
  return stripAboveTranscriptMarker(cleaned.split(/\n+/));
}

/**
 * Identity-relative plain-text pastes (device / manual): `Name: text` lines with
 * multi-line accumulation. `Me` (case-insensitive) or a host participant maps to
 * `me`; other distinct speakers rotate `them` / `alt`. A line may open with a
 * `[m:ss]` timestamp (Granola), which becomes the turn's `startTime` and always
 * starts a new turn; without one, `startTime` stays `null`.
 */
export const labelledTurnsParser: TranscriptParser = {
  name: "labelled-turns",

  canParse(input) {
    if (typeof input.transcription !== "string") return false;
    if (input.transcription.trim().length === 0) return false;
    return turnLines(input.transcription).some((line) => {
      const parsed = parseLine(line.trim());
      if (parsed.hasTimestamp) return true;
      return parsed.label !== null && !isMetaLabel(parsed.label);
    });
  },

  parse(input) {
    if (typeof input.transcription !== "string") return [];

    const assignFlavor = createFlavorAssigner(hostNamesOf(input.participants));
    const turns: TranscriptTurn[] = [];
    let current: TranscriptTurn | null = null;

    for (const rawLine of turnLines(input.transcription)) {
      const line = rawLine.trim();
      if (!line) continue;

      const parsed = parseLine(line);

      // A known meta header (`Date:` etc.) is dropped entirely — never a turn.
      // A timestamped line is speech, whatever its label reads like.
      if (parsed.label && !parsed.hasTimestamp && isMetaLabel(parsed.label)) continue;

      if (parsed.label) {
        if (current) turns.push(current);
        current = {
          text: parsed.text,
          speaker: parsed.label,
          flavor: assignFlavor(parsed.label),
          startTime: parsed.startTime,
        };
      } else if (parsed.hasTimestamp) {
        // A timestamp with no label still marks a new turn; never invent a speaker.
        if (current) turns.push(current);
        current = { text: parsed.text, speaker: null, flavor: null, startTime: parsed.startTime };
      } else if (current) {
        // Continuation line — accumulate into the current turn.
        current.text = `${current.text} ${line}`.trim();
      } else {
        // Leading prose with no label — a speaker-less block, never invent one.
        current = { text: line, speaker: null, flavor: null, startTime: null };
      }
    }
    if (current) turns.push(current);

    return turns.filter((t) => t.text.length > 0);
  },
};
