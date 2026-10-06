import { parseTranscript, type TranscriptTurn } from "~/lib/transcript";

/**
 * Pair a meeting's screenshots with what was said before each one was taken.
 *
 * The capture extension writes a literal `[SCREENSHOT]` marker into the
 * transcript at the moment it saves a frame, so the n-th marker and the n-th
 * Screenshot row (by `createdAt`) are the same capture. That is the same
 * ordering contract `generateDraftActions` relies on for screenshot → action
 * refs. The text between two consecutive markers is the narration that led up
 * to the later capture.
 *
 * Pure and dependency-free (no React/DB) so it is unit-testable and runs the
 * same on client and server.
 */

export interface NarrativeScreenshot {
  id: string;
  url: string;
  /** Capture position badge; empty for hand-attached images. */
  timestamp: string | null;
  createdAt: Date | string;
}

export interface ScreenshotNarrativeEntry {
  screenshot: NarrativeScreenshot;
  /** 1-based capture order. */
  index: number;
  /** Speaker-attributed turns said before this capture; empty when the
   *  transcript has no marker for it (e.g. a hand-attached image). */
  turns: TranscriptTurn[];
}

/** A marker, optionally followed by a sentence-ending period (the extension
 *  emits both shapes). Same shape `stripScreenshots` matches. */
const MARKER_RE = /\[SCREENSHOT\]\.?/;

function createdAtMs(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Screenshots in capture order (oldest first), the order the markers use. */
export function sortScreenshotsChronologically<T extends { createdAt: Date | string }>(
  screenshots: readonly T[],
): T[] {
  return [...screenshots].sort((a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt));
}

/** Number of `[SCREENSHOT]` markers in a transcript. */
export function countScreenshotMarkers(transcription: string | null | undefined): number {
  if (!transcription) return 0;
  return transcription.split(MARKER_RE).length - 1;
}

function segmentToTurns(segment: string): TranscriptTurn[] {
  if (segment.trim().length === 0) return [];
  // The canonical parser strips header blocks and markers, and attributes
  // `Name:` lines to speakers; a plain prose segment becomes one speakerless
  // turn. Segments that start mid-turn (text after a marker on the same line)
  // render as a speakerless continuation, which is honest: nobody new spoke.
  return parseTranscript({ transcription: segment, sentencesJson: null, participants: [] });
}

export function buildScreenshotNarrative(
  transcription: string | null | undefined,
  screenshots: readonly NarrativeScreenshot[],
): ScreenshotNarrativeEntry[] {
  const ordered = sortScreenshotsChronologically(screenshots);
  const segments = transcription ? transcription.split(MARKER_RE) : [];
  // The last segment is what was said after the final capture; it belongs to
  // no screenshot.
  const markerCount = Math.max(segments.length - 1, 0);

  return ordered.map((screenshot, i) => ({
    screenshot,
    index: i + 1,
    turns: i < markerCount ? segmentToTurns(segments[i] ?? "") : [],
  }));
}
