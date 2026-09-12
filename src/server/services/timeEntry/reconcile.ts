/**
 * Manual time always wins (CONTEXT.md "Manual time", decision 2026-09-12).
 *
 * Pure: intervals in, a verdict out. The service loads the owner's manual
 * entries that intersect a proposed segment and applies what this returns.
 * Nothing here touches the start, end, Action or owner of a manual entry —
 * the only write the routine may make to manual time is appending the
 * conversation reference to its note, and that is the caller's job.
 */

export interface ManualInterval {
  /** TimeEntry id — returned in `mergeInto` so the caller can annotate it. */
  id: string;
  actionId: string;
  startMs: number;
  endMs: number;
}

export interface ProposedInterval {
  actionId: string;
  startMs: number;
  endMs: number;
  sourceRef: string;
}

export interface ProposedPiece {
  actionId: string;
  startMs: number;
  endMs: number;
  /** The original ref, or `<ref>#a`, `<ref>#b`, … when the proposal was split. */
  sourceRef: string;
}

export interface ReconcileResult {
  /**
   * `merge`: a manual entry on the SAME Action overlaps — write nothing and
   * annotate those manual entries instead. `write`: write `pieces` (empty
   * when manual time on other Actions covered everything).
   */
  kind: "merge" | "write";
  /** Manual entry ids whose note should carry the conversation reference. */
  mergeInto: string[];
  pieces: ProposedPiece[];
}

/** Pieces shorter than this are noise, not work. */
export const MIN_PIECE_MINUTES = 5;

function overlaps(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export function reconcileProposed(
  manual: ManualInterval[],
  proposed: ProposedInterval,
): ReconcileResult {
  const touching = manual.filter((m) => overlaps(m, proposed));

  const sameAction = touching.filter((m) => m.actionId === proposed.actionId);
  if (sameAction.length > 0) {
    // The person already recorded this work by hand. Their entry stands; the
    // proposal only adds provenance to it.
    return { kind: "merge", mergeInto: sameAction.map((m) => m.id), pieces: [] };
  }

  return {
    kind: "write",
    mergeInto: [],
    pieces: [
      {
        actionId: proposed.actionId,
        startMs: proposed.startMs,
        endMs: proposed.endMs,
        sourceRef: proposed.sourceRef,
      },
    ],
  };
}

/** Append a conversation reference to a manual entry's note, once. */
export function appendReference(note: string | null, sourceRef: string): string {
  if (!note) return sourceRef;
  return note.split(" · ").includes(sourceRef) ? note : `${note} · ${sourceRef}`;
}
