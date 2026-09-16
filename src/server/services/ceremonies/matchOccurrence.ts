/**
 * Decide which occurrence a recorded meeting captured (ADR-0059). Pure so the
 * rules are unit-testable; `autoAttach.ts` loads candidates and persists.
 *
 * Rules, in order:
 *  1. A calendar recurrence id that equals an occurrence's linked Scheduled
 *     meeting (`icalUid`) wins outright — no time window applies.
 *  2. Otherwise a title-alias match: the meeting title contains every token
 *     of one of the ceremony's aliases (lowercase, split on non-alphanumerics,
 *     as `findRelated` does — but WITHOUT its stopword filter, because alias
 *     words such as "standup", "daily" and "review" are precisely the
 *     meeting-pattern words that filter drops). Only occurrences whose
 *     `scheduledStart` lies within
 *     `[meetingDate − 30 min, meetingDate + durationMinutes + 30 min]`
 *     qualify; the nearest start wins.
 *  3. Nothing qualifies → null. A meeting without a date can only match by
 *     calendar id.
 */
import { normaliseTitleTokens } from "~/lib/meetings/titleTokens";

export interface MatchableMeeting {
  title: string | null;
  meetingDate: Date | null;
  /** iCal UID / provider recurrence id when the caller has one. */
  calendarExternalId?: string | null;
}

export interface OccurrenceCandidate {
  id: string;
  scheduledStart: Date;
  durationMinutes: number;
  aliases: string[];
  /** `icalUid` of the occurrence's linked Scheduled meeting, when any. */
  scheduledMeetingIcalUid?: string | null;
}

export interface OccurrenceMatch {
  occurrenceId: string;
  reason: "calendar" | "alias";
  /** The alias that matched (alias rule only). */
  alias?: string;
}

/** Live ingestion slack either side of the window (30 minutes). */
export const DEFAULT_SLACK_MS = 30 * 60_000;
/**
 * Backfill slack: historical imports are often dated only to the day (a
 * Fireflies date at local midnight) or not at all, so backfill widens the
 * window to a day either side and lets nearest-start decide. Backfill is
 * dry-run first and human-reviewed, which is what makes the wide window
 * acceptable there and not on the live path.
 */
export const BACKFILL_SLACK_MS = 24 * 60 * 60_000;

export interface MatchOptions {
  slackMs?: number;
}

/**
 * The date a backfill anchors a meeting on: its meeting date; else a `dd/mm`
 * in the title ("Planning Meeting 20/08 - Cycle 14") with the import's year;
 * else the import date. Live ingestion never guesses — it uses the meeting
 * date or nothing.
 */
export function backfillAnchorDate(meeting: { title: string | null; meetingDate: Date | null; createdAt: Date }): Date {
  if (meeting.meetingDate) return meeting.meetingDate;
  const m = meeting.title ? /(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/.exec(meeting.title) : null;
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const guess = new Date(Date.UTC(meeting.createdAt.getUTCFullYear(), month - 1, day, 12, 0, 0));
      if (!Number.isNaN(guess.getTime())) return guess;
    }
  }
  return meeting.createdAt;
}

/** True when every token of `alias` appears in the title's tokens. */
export function aliasMatches(titleTokens: ReadonlySet<string>, alias: string): boolean {
  const aliasTokens = normaliseTitleTokens(alias);
  return aliasTokens.length > 0 && aliasTokens.every((t) => titleTokens.has(t));
}

export function matchOccurrence(
  meeting: MatchableMeeting,
  candidates: readonly OccurrenceCandidate[],
  opts: MatchOptions = {},
): OccurrenceMatch | null {
  const slackMs = opts.slackMs ?? DEFAULT_SLACK_MS;
  if (meeting.calendarExternalId) {
    const byCalendar = candidates.find(
      (c) => c.scheduledMeetingIcalUid && c.scheduledMeetingIcalUid === meeting.calendarExternalId,
    );
    if (byCalendar) return { occurrenceId: byCalendar.id, reason: "calendar" };
  }

  if (!meeting.title || !meeting.meetingDate) return null;
  const titleTokens = new Set(normaliseTitleTokens(meeting.title));
  if (titleTokens.size === 0) return null;
  const at = meeting.meetingDate.getTime();

  let best: { candidate: OccurrenceCandidate; alias: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const start = candidate.scheduledStart.getTime();
    const windowStart = at - slackMs;
    const windowEnd = at + candidate.durationMinutes * 60_000 + slackMs;
    if (start < windowStart || start > windowEnd) continue;
    const alias = candidate.aliases.find((a) => aliasMatches(titleTokens, a));
    if (!alias) continue;
    const distance = Math.abs(start - at);
    if (!best || distance < best.distance) best = { candidate, alias, distance };
  }
  return best ? { occurrenceId: best.candidate.id, reason: "alias", alias: best.alias } : null;
}
