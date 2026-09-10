/**
 * Decision evidence: quoted transcript turns (ADR-0060, ADR-0032).
 *
 * Shared between the meeting page (which collects turns), the decision
 * service (which stores them as `Decision.evidence`) and the detail page
 * (which deep-links each quote back to its turn). The turn index is the
 * canonical index in the parsed transcript — the same one the transcript
 * view anchors as `#turn-<n>`.
 */

import type { TranscriptTurn } from "~/lib/transcript";

export interface DecisionEvidenceTurn {
  turnIndex: number;
  speaker: string | null;
  startTime: number | null;
  text: string;
}

/** Snapshot a parsed transcript turn as evidence. */
export function turnToEvidence(turn: TranscriptTurn, turnIndex: number): DecisionEvidenceTurn {
  return {
    turnIndex,
    speaker: turn.speaker,
    startTime: turn.startTime,
    text: turn.text,
  };
}

/** DOM id the transcript view gives turn `n`, so evidence can deep-link to it. */
export function transcriptTurnAnchor(turnIndex: number): string {
  return `turn-${turnIndex}`;
}

/** Recording-page URL that opens the Transcript tab scrolled to one turn. */
export function evidenceHref(transcriptionSessionId: string, turnIndex: number): string {
  return `/recording/${transcriptionSessionId}?tab=transcript#${transcriptTurnAnchor(turnIndex)}`;
}

/** Tolerant reader for the stored JSON column — never trusts its shape. */
export function parseEvidence(value: unknown): DecisionEvidenceTurn[] {
  if (!Array.isArray(value)) return [];
  const out: DecisionEvidenceTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.turnIndex !== "number" || typeof obj.text !== "string") continue;
    out.push({
      turnIndex: obj.turnIndex,
      speaker: typeof obj.speaker === "string" ? obj.speaker : null,
      startTime: typeof obj.startTime === "number" ? obj.startTime : null,
      text: obj.text,
    });
  }
  return out;
}

/** `mm:ss` for a turn's start time, or null when the transcript has no times. */
export function formatEvidenceTime(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
