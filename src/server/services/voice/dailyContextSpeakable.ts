/**
 * Pure rendering for the voice daily context: `DailySummaryDigest` → spoken
 * string, plus the argument parsers. No I/O and no Prisma import, so it is
 * unit-testable on its own — the same split as the Daily summary's
 * `render.ts` beside `build.ts`. The I/O half lives in `dailyContext.ts`.
 */
import type {
  DailySummaryCycle,
  DailySummaryDigest,
  DailySummaryPace,
} from "~/server/services/notifications/emit/dailySummary/types";
import {
  boundLength,
  speakableCount,
  stripMarkdown,
} from "~/server/services/voice/speakable";

/** The sections a caller can ask to hear in full. `overview` is the default. */
export const DAILY_CONTEXT_FOCUSES = [
  "overview",
  "meetings",
  "actions",
  "overdue",
  "cycle",
] as const;

export type DailyContextFocus = (typeof DAILY_CONTEXT_FOCUSES)[number];

/**
 * A focused readout enumerates several items, so it needs more room than the
 * 240-character default a single confirmation gets. Still bounded — a spoken
 * turn must never become a minutes-long dump.
 */
export const DAILY_CONTEXT_MAX_SPEAKABLE_LENGTH = 700;

/** How many items the overview names per section before counting the rest. */
const OVERVIEW_NAMED = 3;
/** How many items a focused section names before "and N more". */
const FOCUS_NAMED = 8;
/** Cycle blocks the overview speaks (one per product); the focus speaks all. */
const OVERVIEW_CYCLES = 2;

/** Tolerant parse of the tool's `focus` argument; anything unknown → overview. */
export function parseDailyContextFocus(value: unknown): DailyContextFocus {
  return typeof value === "string" &&
    (DAILY_CONTEXT_FOCUSES as readonly string[]).includes(value)
    ? (value as DailyContextFocus)
    : "overview";
}

/** An IANA timezone name the runtime knows, else null. */
export function parseTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return null;
  }
}

/**
 * Pure: structured digest → bounded spoken string for the requested focus.
 * `overview` walks every section briefly; the others read one section in full.
 */
export function renderDailyContextSpeakable(
  digest: DailySummaryDigest,
  focus: DailyContextFocus = "overview",
): string {
  const sentences =
    focus === "meetings"
      ? [meetingsSentence(digest, FOCUS_NAMED)]
      : focus === "actions"
        ? [actionsSentence(digest, FOCUS_NAMED), overdueSentence(digest, 0)]
        : focus === "overdue"
          ? [overdueSentence(digest, FOCUS_NAMED)]
          : focus === "cycle"
            ? cycleSentences(digest, { full: true })
            : [
                meetingsSentence(digest, OVERVIEW_NAMED),
                actionsSentence(digest, OVERVIEW_NAMED),
                overdueSentence(digest, 0),
                ...cycleSentences(digest, { full: false }),
              ];
  return boundLength(
    sentences.filter(Boolean).join(" "),
    DAILY_CONTEXT_MAX_SPEAKABLE_LENGTH,
  );
}

function meetingsSentence(digest: DailySummaryDigest, named: number): string {
  const meetings = digest.todayMeetings;
  if (meetings.length === 0) return "No meetings today.";
  const items = meetings.map((m) =>
    m.startLocal
      ? `${spokenTime(m.startLocal)} ${clean(m.title)}`
      : `${clean(m.title)} all day`,
  );
  return `${capitalize(speakableCount(meetings.length, "meeting"))} today: ${nameList(items, named)}.`;
}

function actionsSentence(digest: DailySummaryDigest, named: number): string {
  const actions = digest.todaysActions;
  if (actions.length === 0) return "Nothing scheduled or due today.";
  const names = actions.map((a) => clean(a.name));
  return `${capitalize(speakableCount(actions.length, "action"))} for today: ${nameList(names, named)}.`;
}

/** `named` 0 → count only ("4 actions overdue."); otherwise enumerate. */
function overdueSentence(digest: DailySummaryDigest, named: number): string {
  const overdue = digest.overdueActions;
  if (overdue.length === 0) return "Nothing overdue.";
  const lead = `${capitalize(speakableCount(overdue.length, "action"))} overdue`;
  if (named === 0) return `${lead}.`;
  return `${lead}: ${nameList(
    overdue.map((a) => clean(a.name)),
    named,
  )}.`;
}

function cycleSentences(
  digest: DailySummaryDigest,
  { full }: { full: boolean },
): string[] {
  if (digest.cycles.length === 0) return full ? ["No active cycle."] : [];
  const shown = full ? digest.cycles : digest.cycles.slice(0, OVERVIEW_CYCLES);
  const withProduct = digest.cycles.length > 1;
  const lines = shown.flatMap((c) => cycleBlock(c, { full, withProduct }));
  if (!full && digest.cycles.length > shown.length) {
    lines.push(
      `Plus ${speakableCount(digest.cycles.length - shown.length, "more cycle")}; ask about the cycle for all of them.`,
    );
  }
  return lines;
}

function cycleBlock(
  cycle: DailySummaryCycle,
  { full, withProduct }: { full: boolean; withProduct: boolean },
): string[] {
  const lines: string[] = [];
  const name = withProduct
    ? `${clean(cycle.name)} in ${clean(cycle.productName)}`
    : clean(cycle.name);

  const status: string[] = [];
  if (cycle.committed === 0) {
    status.push("no tickets committed yet");
  } else {
    const unit = cycle.unit === "pts" ? "points" : "tickets";
    status.push(`${cycle.completed} of ${cycle.committed} ${unit} done`);
  }
  if (cycle.daysLeft !== null) status.push(daysLeftPhrase(cycle.daysLeft));
  if (cycle.committed > 0 && cycle.pace) status.push(PACE_PHRASES[cycle.pace]);
  lines.push(`${name}: ${status.join(", ")}.`);

  const inFlightNamed = full ? FOCUS_NAMED : 2;
  if (cycle.inFlight.length === 0) {
    if (full) lines.push("Nothing in flight for you.");
  } else {
    const items = cycle.inFlight.map((t) =>
      full ? `${clean(t.title)} (${statusPhrase(t.status)})` : clean(t.title),
    );
    lines.push(`In flight: ${nameList(items, inFlightNamed)}.`);
  }

  if (cycle.upNext.length === 0) {
    if (full) lines.push("Nothing else committed to you.");
  } else if (full) {
    lines.push(
      `Up next: ${nameList(
        cycle.upNext.map((t) => clean(t.title)),
        FOCUS_NAMED,
      )}.`,
    );
  } else {
    lines.push(`Up next: ${speakableCount(cycle.upNext.length, "ticket")}.`);
  }

  if (full && cycle.unrefinedCount > 0) {
    lines.push(
      `${capitalize(speakableCount(cycle.unrefinedCount, "ticket"))} of yours still ${
        cycle.unrefinedCount === 1 ? "needs" : "need"
      } refinement.`,
    );
  }
  return lines;
}

const PACE_PHRASES: Record<DailySummaryPace, string> = {
  ahead: "ahead of pace",
  ontrack: "on pace",
  behind: "behind pace",
};

const STATUS_PHRASES: Record<string, string> = {
  IN_PROGRESS: "in progress",
  BLOCKED: "blocked",
  QA: "in QA",
};

function statusPhrase(status: string): string {
  return STATUS_PHRASES[status] ?? status.toLowerCase().replace(/_/g, " ");
}

function daysLeftPhrase(daysLeft: number): string {
  const n = Math.abs(daysLeft);
  const unit = n === 1 ? "day" : "days";
  return daysLeft < 0 ? `${n} ${unit} over` : `${n} ${unit} left`;
}

/** "09:05" → "9:05" — leading zeros read badly aloud. */
function spokenTime(hhmm: string): string {
  return hhmm.replace(/^0/, "");
}

/** "a", "a and b", "a, b and c", "a, b, c and 2 more". */
function nameList(items: string[], named: number): string {
  const shown = items.slice(0, named);
  const rest = items.length - shown.length;
  const parts = rest > 0 ? [...shown, `${rest} more`] : shown;
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function clean(s: string): string {
  return stripMarkdown(s);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
