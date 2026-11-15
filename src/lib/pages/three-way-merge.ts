/**
 * Line-level three-way merge of Markdown, the way `git merge` reconciles two
 * branches: `base` is the text both writers started from, `ours` is what is
 * stored now, `theirs` is the incoming write. Changes that touch different
 * regions of `base` both land; changes that touch the same or adjacent lines
 * are a conflict and nothing is merged.
 *
 * Pure, so it is unit-tested on its own and the router only decides what to
 * do with the result (ADR-0074, "stale writes merge").
 */
import { diffArrays } from "diff";

/** One region of `base` a side changed, and what it put there instead. */
interface Hunk {
  /** First changed base line (an insertion sits *before* this line). */
  baseStart: number;
  /** Lines of `base` replaced; 0 for a pure insertion. */
  baseLen: number;
  /** The side's replacement lines. */
  lines: string[];
}

export interface MergeConflict {
  /** The base lines both sides changed (empty when both inserted here). */
  base: string[];
  ours: string[];
  theirs: string[];
}

export type ThreeWayMergeResult =
  | { ok: true; merged: string; changed: boolean }
  | { ok: false; conflicts: MergeConflict[] };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  // A trailing newline is not an extra empty line.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The regions of `base` that `side` changed, in base order. */
function hunksAgainst(base: string[], side: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  let baseIdx = 0;
  let open: Hunk | null = null;
  for (const change of diffArrays(base, side)) {
    const count = change.value.length;
    if (change.removed) {
      open ??= { baseStart: baseIdx, baseLen: 0, lines: [] };
      open.baseLen += count;
      baseIdx += count;
    } else if (change.added) {
      open ??= { baseStart: baseIdx, baseLen: 0, lines: [] };
      open.lines.push(...change.value);
    } else {
      if (open) hunks.push(open);
      open = null;
      baseIdx += count;
    }
  }
  if (open) hunks.push(open);
  return hunks;
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

export function threeWayMerge(
  baseText: string,
  oursText: string,
  theirsText: string,
): ThreeWayMergeResult {
  const base = splitLines(baseText);
  const ours = hunksAgainst(base, splitLines(oursText)).map((h) => ({ ...h, side: "ours" as const }));
  const theirs = hunksAgainst(base, splitLines(theirsText)).map((h) => ({ ...h, side: "theirs" as const }));

  // Walk both hunk lists in base order, grouping hunks whose base ranges
  // overlap or touch into one cluster. Touching counts: an insertion right
  // where the other side rewrote a paragraph is ambiguous, and git draws the
  // same line. A cluster from one side applies; a cluster from both is a
  // conflict unless both sides made the identical change.
  const all = [...ours, ...theirs].sort(
    (a, b) => a.baseStart - b.baseStart || a.baseLen - b.baseLen,
  );
  const out: string[] = [];
  const conflicts: MergeConflict[] = [];
  let cursor = 0;
  let i = 0;
  while (i < all.length) {
    const cluster = [all[i]!];
    let end = all[i]!.baseStart + all[i]!.baseLen;
    let j = i + 1;
    while (j < all.length && all[j]!.baseStart <= end) {
      cluster.push(all[j]!);
      end = Math.max(end, all[j]!.baseStart + all[j]!.baseLen);
      j++;
    }
    const start = cluster[0]!.baseStart;
    out.push(...base.slice(cursor, start));

    const oursIn = cluster.filter((h) => h.side === "ours");
    const theirsIn = cluster.filter((h) => h.side === "theirs");
    if (oursIn.length === 0 || theirsIn.length === 0) {
      // One side only: replay its hunks over the base slice.
      let at = start;
      for (const h of cluster) {
        out.push(...base.slice(at, h.baseStart), ...h.lines);
        at = h.baseStart + h.baseLen;
      }
      out.push(...base.slice(at, end));
    } else {
      const apply = (hunks: Hunk[]): string[] => {
        const lines: string[] = [];
        let at = start;
        for (const h of hunks) {
          lines.push(...base.slice(at, h.baseStart), ...h.lines);
          at = h.baseStart + h.baseLen;
        }
        lines.push(...base.slice(at, end));
        return lines;
      };
      const oursLines = apply(oursIn);
      const theirsLines = apply(theirsIn);
      if (sameLines(oursLines, theirsLines)) {
        out.push(...oursLines);
      } else {
        conflicts.push({ base: base.slice(start, end), ours: oursLines, theirs: theirsLines });
      }
    }
    cursor = end;
    i = j;
  }
  if (conflicts.length > 0) return { ok: false, conflicts };
  out.push(...base.slice(cursor));

  let merged = out.join("\n");
  // Keep a trailing newline when the stored text has one.
  if (oursText.endsWith("\n") && merged !== "" && !merged.endsWith("\n")) merged += "\n";
  return { ok: true, merged, changed: merged !== oursText };
}
