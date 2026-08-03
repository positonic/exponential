import type { TicketStatus, TicketType } from "@prisma/client";

/**
 * ticketSync/merge — the three-way field merge at the heart of the sync.
 *
 * Both sides are expressed in the LOCAL representation (`SyncedFields`):
 * inbound mapping (mapping.ts) converts Notion property values before the
 * merge runs, and outbound mapping converts after. The merge itself never
 * touches Notion shapes, Prisma, or I/O of any kind.
 *
 * Rules (per field, against the last-sync snapshot as base):
 * - unchanged on both sides            → nothing
 * - changed on one side only           → propagate to the other side
 * - changed on both sides, same value  → converged, nothing to write
 * - changed on both sides, different   → CONFLICT: last-write-wins by edit
 *   timestamp; the loser side gets the winner's value; recorded for the run log
 * - no snapshot (first sync of an adopted ticket): any differing field is
 *   treated as a two-sided change → LWW, recorded as a conflict
 *
 * The returned `snapshot` is the converged state — persist it as the new base
 * only after BOTH apply sets have been written successfully.
 */

export interface SyncedFields {
  title: string;
  status: TicketStatus;
  priority: number | null;
  type: TicketType;
  points: number | null;
  /** Workspace label names; compared order-insensitively. */
  labels: string[];
  cycleName: string | null;
  assigneeEmail: string | null;
}

export type SyncedFieldKey = keyof SyncedFields;

export const SYNCED_FIELD_KEYS: SyncedFieldKey[] = [
  "title",
  "status",
  "priority",
  "type",
  "points",
  "labels",
  "cycleName",
  "assigneeEmail",
];

/**
 * Surfaced on every row whose cycle relation cannot be read (frosty.flame).
 * Lives here (the dependency-free module) so both engines can import it
 * without dragging each other's runtime graphs into test files.
 */
export const CYCLE_UNREADABLE_WARNING =
  "cycle page unreadable — share the Cycles database with the Notion connection";

export interface MergeConflict {
  field: SyncedFieldKey;
  winner: "local" | "remote";
  localValue: SyncedFields[SyncedFieldKey];
  remoteValue: SyncedFields[SyncedFieldKey];
}

export interface MergeResult {
  /** Field writes to apply to the ticket (values from the remote side). */
  applyToLocal: Partial<SyncedFields>;
  /** Field writes to apply to the Notion page (values from the local side). */
  applyToRemote: Partial<SyncedFields>;
  conflicts: MergeConflict[];
  /** The converged state — the next sync's base. */
  snapshot: SyncedFields;
}

export interface MergeInput {
  /** Last-sync snapshot; null for an adopted ticket's first sync. */
  base: Partial<SyncedFields> | null;
  local: SyncedFields;
  remote: SyncedFields;
  /** Last edit times, used ONLY to break same-field two-sided conflicts. */
  localEditedAt: Date;
  remoteEditedAt: Date;
}

export function fieldEquals(
  a: SyncedFields[SyncedFieldKey] | undefined,
  b: SyncedFields[SyncedFieldKey] | undefined,
): boolean {
  const av = a ?? null;
  const bv = b ?? null;
  if (Array.isArray(av) || Array.isArray(bv)) {
    const aArr = Array.isArray(av) ? [...av].sort() : [];
    const bArr = Array.isArray(bv) ? [...bv].sort() : [];
    return (
      aArr.length === bArr.length && aArr.every((v, i) => v === bArr[i])
    );
  }
  return av === bv;
}

export function mergeSyncedFields(input: MergeInput): MergeResult {
  const { base, local, remote, localEditedAt, remoteEditedAt } = input;

  const applyToLocal: Partial<SyncedFields> = {};
  const applyToRemote: Partial<SyncedFields> = {};
  const conflicts: MergeConflict[] = [];
  const snapshot = { ...local };

  for (const field of SYNCED_FIELD_KEYS) {
    const localValue = local[field];
    const remoteValue = remote[field];

    if (fieldEquals(localValue, remoteValue)) {
      // Converged (or never diverged) — snapshot already carries the value.
      continue;
    }

    // With no base, a difference is indistinguishable from a two-sided change.
    const localChanged = base === null || !fieldEquals(base[field], localValue);
    const remoteChanged = base === null || !fieldEquals(base[field], remoteValue);

    if (remoteChanged && !localChanged) {
      (applyToLocal as Record<string, unknown>)[field] = remoteValue;
      (snapshot as Record<string, unknown>)[field] = remoteValue;
    } else if (localChanged && !remoteChanged) {
      (applyToRemote as Record<string, unknown>)[field] = localValue;
      // snapshot already carries the local value
    } else {
      // Same field changed on both sides → last write wins.
      const winner =
        localEditedAt.getTime() >= remoteEditedAt.getTime() ? "local" : "remote";
      conflicts.push({ field, winner, localValue, remoteValue });
      if (winner === "local") {
        (applyToRemote as Record<string, unknown>)[field] = localValue;
      } else {
        (applyToLocal as Record<string, unknown>)[field] = remoteValue;
        (snapshot as Record<string, unknown>)[field] = remoteValue;
      }
    }
  }

  return { applyToLocal, applyToRemote, conflicts, snapshot };
}
