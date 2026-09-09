/**
 * The structured Daily summary digest (ADR-0059). Built once per user by
 * `buildDailySummary`, then rendered per channel family by the pure renderers
 * in `./render` — markdown for Matrix, plain text for every other channel.
 * Every URL is absolute; every time string is already in the user's timezone.
 */

export type DailySummaryPace = "ahead" | "ontrack" | "behind";

/** One line under Yesterday: a calendar event (optionally with its recording) or an unmatched recording. */
export interface DailySummaryYesterdayItem {
  /** `HH:mm` in the user's timezone; null for all-day events and undated recordings. */
  startLocal: string | null;
  title: string;
  /** Absolute `/recording/<id>` URL when a recorded Meeting matched (or is) this row. */
  recordingUrl: string | null;
  source: "calendar" | "recording";
}

export interface DailySummaryMeetingItem {
  /** `HH:mm` in the user's timezone; null for all-day events. */
  startLocal: string | null;
  title: string;
}

export interface DailySummaryActionItem {
  name: string;
}

export interface DailySummaryTicketRef {
  /** Product-aware display id plus title, e.g. `C-154 Specify a pipeline testing thunderdome`. */
  label: string;
  url: string;
}

export interface DailySummaryInFlightTicket extends DailySummaryTicketRef {
  /** Raw `TicketStatus` value (`IN_PROGRESS` | `BLOCKED` | `QA`); renderers map it to a label. */
  status: string;
}

/** The condensed cycle hero for one product the user holds tickets in. */
export interface DailySummaryCycle {
  productName: string;
  name: string;
  /** `d MMM – d MMM`, or null when the cycle has no dates. */
  range: string | null;
  /** Whole days until the cycle ends; negative when over; null without an end date. */
  daysLeft: number | null;
  completed: number;
  committed: number;
  unit: "pts" | "tickets";
  /** 0–100 share of the cycle window elapsed; null without both dates. */
  elapsedPct: number | null;
  pace: DailySummaryPace | null;
  cycleUrl: string;
  /** The user's `IN_PROGRESS` / `BLOCKED` / `QA` tickets in this cycle. */
  inFlight: DailySummaryInFlightTicket[];
  /** The user's `COMMITTED` tickets in this cycle — the Up next section. */
  upNext: DailySummaryTicketRef[];
  /** The user's cycle tickets still `BACKLOG` / `NEEDS_REFINEMENT` / `READY_TO_PLAN`. */
  unrefinedCount: number;
}

export interface DailySummaryDigest {
  firstName: string;
  yesterday: DailySummaryYesterdayItem[];
  todayMeetings: DailySummaryMeetingItem[];
  /** Exactly the `todays` bucket of `partitionActions`, cross-workspace (ADR-0034). */
  todaysActions: DailySummaryActionItem[];
  overdueCount: number;
  /** Absolute URL of `/today`. */
  todayUrl: string;
  /**
   * One block per product in the summary workspace where the user holds
   * tickets and a current cycle exists, in product-name order. Empty when the
   * user has no default workspace or no product has a current cycle.
   */
  cycles: DailySummaryCycle[];
}
