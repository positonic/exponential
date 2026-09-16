/**
 * Forgotten-timer flag (CONTEXT.md "Manual time"): a manual entry that runs
 * more than an hour past the person's last recorded activity that day was
 * probably a Timer nobody stopped. It is a flag on read, never a write — the
 * entry is left exactly as the person made it.
 */

export const FORGOTTEN_TIMER_GAP_MINUTES = 60;

/** Manual time: the Timer's legacy stamp and hand-made entries. */
export const MANUAL_SOURCES = new Set(["plugin", "manual"]);

export interface FlaggableEntry {
  id: string;
  source: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
}

/**
 * Ids of the manual entries in one day's list that end more than
 * `FORGOTTEN_TIMER_GAP_MINUTES` after the latest end of any OTHER completed
 * entry that day. A day with a single entry has no reference point and
 * flags nothing.
 */
export function flagForgottenTimers(entries: FlaggableEntry[]): Set<string> {
  const flagged = new Set<string>();
  const completed = entries.filter((e) => e.endedAt !== null);
  if (completed.length < 2) return flagged;

  for (const entry of completed) {
    if (!MANUAL_SOURCES.has(entry.source)) continue;
    const end = new Date(entry.endedAt!).getTime();
    let lastOther = -Infinity;
    for (const other of completed) {
      if (other.id === entry.id) continue;
      lastOther = Math.max(lastOther, new Date(other.endedAt!).getTime());
    }
    if (end - lastOther > FORGOTTEN_TIMER_GAP_MINUTES * 60_000) flagged.add(entry.id);
  }
  return flagged;
}
