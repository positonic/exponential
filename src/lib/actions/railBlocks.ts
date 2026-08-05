import { hourFloat } from "~/lib/actions/dates";
import { hasUserChosenTime, type TimeBlockFields } from "~/lib/actions/scheduling";

/**
 * One positioned block on the Today agenda rail. `start`/`end` are hour floats
 * (e.g. 10.5 === 10:30) in local time, matching `hourFloat`.
 */
export interface RailBlock {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: "cal" | "task" | "focus";
}

/** Structural shape of a Google Calendar event as `calendar.getTodayEvents` returns it. */
export interface RailCalendarEvent {
  id: string;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

/** Structural shape of the Action fields the rail needs. */
export interface RailSchedulableAction extends TimeBlockFields {
  id: string;
  name: string;
}

/** Used only when an action expresses no length at all. */
export const DEFAULT_RAIL_BLOCK_MINUTES = 60;

const MS_MINUTE = 60_000;

/**
 * How long a scheduled action's rail block is, in minutes.
 *
 * Precedence matches `convertActionToCalendarItem` in the calendar's overlap
 * utility — `duration` wins over `scheduledEnd` when both are set, because
 * `duration` is what the scheduling UI writes when the user states a length.
 * Falls back to `DEFAULT_RAIL_BLOCK_MINUTES` when neither yields a positive
 * span, so a malformed `scheduledEnd` can't collapse the block to nothing.
 */
export function resolveActionDurationMinutes(
  action: Pick<RailSchedulableAction, "scheduledEnd" | "duration">,
  start: Date,
): number {
  if (action.duration != null && action.duration > 0) return action.duration;

  if (action.scheduledEnd) {
    const end = new Date(action.scheduledEnd);
    const spanMinutes = (end.getTime() - start.getTime()) / MS_MINUTE;
    if (Number.isFinite(spanMinutes) && spanMinutes > 0) return spanMinutes;
  }

  return DEFAULT_RAIL_BLOCK_MINUTES;
}

export interface BuildRailBlocksInput {
  events?: RailCalendarEvent[] | null;
  actions?: RailSchedulableAction[] | null;
}

/**
 * The single source of truth for the Today agenda rail's blocks — shared by the
 * desktop shell (`TodayDesktopShell`) and the mobile layout (`TodayLayout`) so
 * the two surfaces can't drift.
 *
 * Pure: it reads no clock and no query cache, so it is directly testable.
 */
export function buildRailBlocks({
  events,
  actions,
}: BuildRailBlocksInput): RailBlock[] {
  const blocks: RailBlock[] = [];

  for (const ev of events ?? []) {
    const startStr = ev.start?.dateTime ?? ev.start?.date;
    const endStr = ev.end?.dateTime ?? ev.end?.date;
    if (!startStr || !endStr) continue;
    blocks.push({
      id: ev.id,
      title: ev.summary || "Untitled",
      start: hourFloat(new Date(startStr)),
      end: hourFloat(new Date(endStr)),
      kind: "cal",
    });
  }

  for (const a of actions ?? []) {
    // Only actions the user genuinely gave a time. A bare `scheduledStart` is
    // usually an instant some code path stamped, not a commitment, and drawing
    // those buried the rail in phantom hour-long blocks. Untimed tasks are
    // omitted outright rather than shelved in a separate strip — they are
    // already in the task list beside the rail, so nothing is lost.
    if (!hasUserChosenTime(a)) continue;
    const start = new Date(a.scheduledStart);
    const durationMinutes = resolveActionDurationMinutes(a, start);
    blocks.push({
      id: `act-${a.id}`,
      title: a.name,
      start: hourFloat(start),
      end: hourFloat(new Date(start.getTime() + durationMinutes * MS_MINUTE)),
      kind: "task",
    });
  }

  return blocks;
}
