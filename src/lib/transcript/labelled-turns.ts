import { createFlavorAssigner, hostNamesOf } from "./flavor";
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

function isMetaLabel(label: string): boolean {
  return META_HEADER_KEYS.has(label.trim().toLowerCase());
}

function stripScreenshots(raw: string): string {
  return raw.replace(/\s*\[SCREENSHOT\]\.?\s*/g, " ");
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
 * `me`; other distinct speakers rotate `them` / `alt`. Timeless → `startTime`
 * stays `null`.
 */
export const labelledTurnsParser: TranscriptParser = {
  name: "labelled-turns",

  canParse(input) {
    if (typeof input.transcription !== "string") return false;
    if (input.transcription.trim().length === 0) return false;
    return turnLines(input.transcription).some((line) => {
      const match = SPEAKER_RE.exec(line.trim());
      return match !== null && !isMetaLabel(match[1]!);
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

      const match = SPEAKER_RE.exec(line);

      // A known meta header (`Date:` etc.) is dropped entirely — never a turn.
      if (match && isMetaLabel(match[1]!)) continue;

      if (match) {
        if (current) turns.push(current);
        const speaker = match[1]!.trim();
        current = {
          text: line.slice(match[0].length).trim(),
          speaker,
          flavor: assignFlavor(speaker),
          startTime: null,
        };
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
