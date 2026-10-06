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
  /** Speaker-attributed turns said before this capture; empty for a
   *  hand-attached image (no marker) or a capture past the marker count. */
  turns: TranscriptTurn[];
}

/** A marker, optionally followed by a sentence-ending period (the extension
 *  emits both shapes). Same shape `stripScreenshots` matches. */
const MARKER_RE = /\[SCREENSHOT\]\.?/g;

/** Stands in for a marker through the transcript parser. A private-use code
 *  point: nothing in the parsers strips it, `trim()` keeps it, and it can't
 *  collide with real text. */
const MARKER_SENTINEL = "\uE000";

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

/** Only the extension writes a marker, and only the extension records a
 *  capture position; a hand-attached image has neither, so it must not
 *  consume a marker that belongs to the next real capture. */
function isExtensionCapture(screenshot: NarrativeScreenshot): boolean {
  return typeof screenshot.timestamp === "string" && screenshot.timestamp.length > 0;
}

/**
 * Split the transcript into one passage per marker, keeping speaker
 * attribution across marker boundaries. The whole transcript goes through the
 * canonical parser once (so header blocks and speaker labels are handled the
 * same way the Transcript tab does), with each marker carried through as a
 * sentinel; a turn is then cut at its sentinels and every piece keeps the
 * turn's speaker. Index n holds what was said before marker n+1; the final
 * element is what followed the last marker.
 */
function splitAtMarkers(transcription: string): TranscriptTurn[][] {
  const turns = parseTranscript({
    transcription: transcription.replace(MARKER_RE, MARKER_SENTINEL),
    sentencesJson: null,
    participants: [],
  });
  const passages: TranscriptTurn[][] = [[]];
  for (const turn of turns) {
    const pieces = turn.text.split(MARKER_SENTINEL);
    pieces.forEach((piece, i) => {
      const text = piece.trim();
      if (text.length > 0) passages[passages.length - 1]!.push({ ...turn, text });
      if (i < pieces.length - 1) passages.push([]);
    });
  }
  return passages;
}

export function buildScreenshotNarrative(
  transcription: string | null | undefined,
  screenshots: readonly NarrativeScreenshot[],
): ScreenshotNarrativeEntry[] {
  const passages = transcription ? splitAtMarkers(transcription) : [];
  // The last passage is what was said after the final capture; it belongs to
  // no screenshot.
  const markerCount = Math.max(passages.length - 1, 0);

  let marker = 0;
  return sortScreenshotsChronologically(screenshots).map((screenshot, i) => {
    let turns: TranscriptTurn[] = [];
    if (isExtensionCapture(screenshot)) {
      if (marker < markerCount) turns = passages[marker] ?? [];
      marker += 1;
    }
    return { screenshot, index: i + 1, turns };
  });
}
