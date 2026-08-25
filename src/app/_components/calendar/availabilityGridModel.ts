/**
 * Pure layout/selection model for the availability grid — extracted from the
 * component so the tricky parts (timezone-agnostic cell placement, span
 * conflict computation) are unit-testable.
 *
 * The server returns cells aligned to the UTC-epoch 30-min grid. The grid
 * renders on the VIEWER'S wall clock, so cells are bucketed into local
 * (day, minutes-of-day) positions from the actual returned instants — never
 * reconstructed from local wall times, which silently misses every cell in
 * timezones whose offset isn't a multiple of the cell size (Asia/Kathmandu
 * +05:45, Pacific/Chatham +12:45: rows land on :15/:45 and that's fine).
 */

import {
  SCHEDULING_WINDOW_START_MINUTES,
  SCHEDULING_WINDOW_END_MINUTES,
} from "~/server/services/calendar/slotEngine";

export type CellStatus = "free" | "busy" | "outside";

export interface GridAttendee {
  userId: string;
  statuses: CellStatus[];
}

export interface GridLayout {
  /** Viewer-local days spanned by the loaded cells, in order. */
  days: { key: string; date: Date }[];
  /** Viewer-local row start minutes inside the scheduling window, sorted. */
  rowMinutes: number[];
  /** Cell index at a (day, row) position; undefined when not loaded. */
  indexAt: (dayKey: string, minutes: number) => number | undefined;
}

const dayKeyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function buildGridLayout(cellStartsAt: Date[], cellMinutes: number): GridLayout {
  const days = new Map<string, Date>();
  const minuteSet = new Set<number>();
  const indexByPosition = new Map<string, number>();

  cellStartsAt.forEach((date, index) => {
    const dayKey = dayKeyOf(date);
    if (!days.has(dayKey)) {
      days.set(dayKey, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    }
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (
      minutes >= SCHEDULING_WINDOW_START_MINUTES &&
      minutes + cellMinutes <= SCHEDULING_WINDOW_END_MINUTES
    ) {
      minuteSet.add(minutes);
    }
    indexByPosition.set(`${dayKey}#${minutes}`, index);
  });

  return {
    days: [...days.entries()].map(([key, date]) => ({ key, date })),
    rowMinutes: [...minuteSet].sort((a, b) => a - b),
    indexAt: (dayKey, minutes) => indexByPosition.get(`${dayKey}#${minutes}`),
  };
}

export interface SpanState {
  /**
   * "unloaded" — the span runs off the loaded range: not offerable;
   * "outside" — some attendee's work-hours/window constraint rejects it;
   * "open"    — offerable; busyUserIds says who it would exclude.
   */
  kind: "unloaded" | "outside" | "open";
  busyUserIds: string[];
  freeCount: number;
}

/**
 * Judge the contiguous span of `spanCells` cells starting at `startIndex` —
 * the candidate slot a click on that cell proposes. Contiguity is verified
 * against the actual cell instants, so a span crossing a range boundary
 * reads "unloaded" rather than silently skipping time.
 */
export function computeSpanState(
  startIndex: number | undefined,
  cellStartsAt: Date[],
  cellMinutes: number,
  spanCells: number,
  attendees: GridAttendee[],
): SpanState {
  if (startIndex === undefined || cellStartsAt.length === 0) {
    return { kind: "unloaded", busyUserIds: [], freeCount: 0 };
  }
  const cellMs = cellMinutes * 60 * 1000;
  const startMs = cellStartsAt[startIndex]!.getTime();
  const busy = new Set<string>();
  let outside = false;

  for (let i = 0; i < spanCells; i += 1) {
    const cell = cellStartsAt[startIndex + i];
    if (!cell || cell.getTime() !== startMs + i * cellMs) {
      return { kind: "unloaded", busyUserIds: [], freeCount: 0 };
    }
    for (const attendee of attendees) {
      const status = attendee.statuses[startIndex + i];
      if (status === "outside") outside = true;
      if (status === "busy") busy.add(attendee.userId);
    }
  }

  if (outside) return { kind: "outside", busyUserIds: [], freeCount: 0 };
  const busyUserIds = [...busy];
  return { kind: "open", busyUserIds, freeCount: attendees.length - busyUserIds.length };
}
