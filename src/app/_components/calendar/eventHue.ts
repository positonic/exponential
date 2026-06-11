/**
 * Calendar event hue assignment.
 *
 * Maps each event to one of the 7 harmonized event hues (defined as
 * `--ev-*` tokens in globals.css and aliased under Tailwind's `event-*`
 * family). The goal is a calm, coherent grid: every event from the same
 * source calendar reads as the same hue across the week, instead of the
 * old per-event-id rainbow.
 *
 * Assignment order:
 *   1. Cancelled / tentative status → fixed hues (rose / amber) so they
 *      stay distinguishable regardless of source calendar.
 *   2. Name heuristics → holidays / birthdays read as low-signal slate.
 *   3. Stable hash of the calendarId across the 6 vivid hues, so a calendar
 *      keeps one consistent hue without needing a hardcoded per-calendar map.
 *
 * NOTE: Tailwind only keeps class names that appear as complete literal
 * strings in source, so EVENT_HUE_CLASSES spells every class out in full —
 * never build `bg-event-${hue}-fill` dynamically or it will be purged.
 */

export type EventHue =
  | "indigo"
  | "cyan"
  | "green"
  | "amber"
  | "violet"
  | "rose"
  | "slate";

/** Vivid hues used by the auto-rotation. Slate is reserved for low-signal. */
const VIVID_HUES: EventHue[] = [
  "indigo",
  "cyan",
  "green",
  "amber",
  "violet",
  "rose",
];

/** Minimal structural shape — works for CalendarEvent / CalendarEventWithSource. */
export interface HueInput {
  id: string;
  status?: string;
  calendarId?: string;
  calendarName?: string;
  summary?: string;
}

const LOW_SIGNAL_RE = /holiday|holidays|birthday|week\s?\d/i;

function stableHash(input: string): number {
  return input
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function getEventHue(event: HueInput): EventHue {
  if (event.status === "cancelled") return "rose";
  if (event.status === "tentative") return "amber";

  const haystack = `${event.calendarName ?? ""} ${event.summary ?? ""}`;
  if (LOW_SIGNAL_RE.test(haystack)) return "slate";

  // Hash the source calendar (falls back to the event id for events with no
  // calendar source, e.g. previews) so the hue is stable per calendar.
  const key = event.calendarId ?? event.id;
  return VIVID_HUES[stableHash(key) % VIVID_HUES.length]!;
}

/** Class fragments for one hue, used by event chips. All literal for Tailwind. */
export interface EventHueClasses {
  /** Tinted fill background (default state). */
  fill: string;
  /** Tinted fill on hover / selected (24% mix). */
  fillHover: string;
  /** Tinted fill for past events (10% mix). */
  fillPast: string;
  /** AA label text. */
  label: string;
  /** Dimmed label text for past events. */
  labelPast: string;
  /** Secondary "sub" text (time, location). */
  sub: string;
  /** 4px left accent bar (full-strength hue). */
  bar: string;
}

export const EVENT_HUE_CLASSES: Record<EventHue, EventHueClasses> = {
  indigo: {
    fill: "bg-event-indigo-fill",
    fillHover: "hover:bg-event-indigo-fill-hover",
    fillPast: "bg-event-indigo-fill-past",
    label: "text-event-indigo-label",
    labelPast: "text-event-indigo-label-past",
    sub: "text-event-indigo-sub",
    bar: "border-l-4 border-l-event-indigo border-y-0 border-r-0",
  },
  cyan: {
    fill: "bg-event-cyan-fill",
    fillHover: "hover:bg-event-cyan-fill-hover",
    fillPast: "bg-event-cyan-fill-past",
    label: "text-event-cyan-label",
    labelPast: "text-event-cyan-label-past",
    sub: "text-event-cyan-sub",
    bar: "border-l-4 border-l-event-cyan border-y-0 border-r-0",
  },
  green: {
    fill: "bg-event-green-fill",
    fillHover: "hover:bg-event-green-fill-hover",
    fillPast: "bg-event-green-fill-past",
    label: "text-event-green-label",
    labelPast: "text-event-green-label-past",
    sub: "text-event-green-sub",
    bar: "border-l-4 border-l-event-green border-y-0 border-r-0",
  },
  amber: {
    fill: "bg-event-amber-fill",
    fillHover: "hover:bg-event-amber-fill-hover",
    fillPast: "bg-event-amber-fill-past",
    label: "text-event-amber-label",
    labelPast: "text-event-amber-label-past",
    sub: "text-event-amber-sub",
    bar: "border-l-4 border-l-event-amber border-y-0 border-r-0",
  },
  violet: {
    fill: "bg-event-violet-fill",
    fillHover: "hover:bg-event-violet-fill-hover",
    fillPast: "bg-event-violet-fill-past",
    label: "text-event-violet-label",
    labelPast: "text-event-violet-label-past",
    sub: "text-event-violet-sub",
    bar: "border-l-4 border-l-event-violet border-y-0 border-r-0",
  },
  rose: {
    fill: "bg-event-rose-fill",
    fillHover: "hover:bg-event-rose-fill-hover",
    fillPast: "bg-event-rose-fill-past",
    label: "text-event-rose-label",
    labelPast: "text-event-rose-label-past",
    sub: "text-event-rose-sub",
    bar: "border-l-4 border-l-event-rose border-y-0 border-r-0",
  },
  slate: {
    fill: "bg-event-slate-fill",
    fillHover: "hover:bg-event-slate-fill-hover",
    fillPast: "bg-event-slate-fill-past",
    label: "text-event-slate-label",
    labelPast: "text-event-slate-label-past",
    sub: "text-event-slate-sub",
    bar: "border-l-4 border-l-event-slate border-y-0 border-r-0",
  },
};

/** Full-strength hue background, for legend dots / swatches. All literal. */
export const EVENT_HUE_DOT: Record<EventHue, string> = {
  indigo: "bg-event-indigo",
  cyan: "bg-event-cyan",
  green: "bg-event-green",
  amber: "bg-event-amber",
  violet: "bg-event-violet",
  rose: "bg-event-rose",
  slate: "bg-event-slate",
};

/**
 * Build the className for an event chip from its hue + state.
 * Returns the fill, accent bar, and label classes; pass the result of
 * `getEventHue` (or an explicit hue) plus an optional `isPast` flag.
 */
export function eventChipClasses(hue: EventHue, opts?: { isPast?: boolean }): string {
  const c = EVENT_HUE_CLASSES[hue];
  if (opts?.isPast) {
    return `${c.fillPast} ${c.bar} ${c.labelPast}`;
  }
  return `${c.fill} ${c.fillHover} ${c.bar} ${c.label}`;
}
