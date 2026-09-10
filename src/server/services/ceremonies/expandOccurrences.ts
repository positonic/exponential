/**
 * Occurrence generation for Ceremonies (ADR-0059).
 *
 * A ceremony stores its cadence as a bare RFC 5545 RRULE body
 * (`FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0`), the IANA zone it is
 * evaluated in, and the date the rule is anchored to (`startsOn`). The time of
 * day comes from `BYHOUR` / `BYMINUTE` in the rule; a rule without them ticks
 * at midnight in the ceremony's zone. Everything here is pure so it can be
 * unit-tested without a database; callers persist the result with
 * `createMany({ skipDuplicates: true })` against the
 * `(ceremonyId, scheduledStart)` unique constraint.
 *
 * Engine: `rrule-temporal` (already a transitive dependency via `node-ical`),
 * never the older `rrule` package.
 */
import { RRuleTemporal } from "rrule-temporal";

export interface CadenceDefinition {
  /** RRULE body without the `RRULE:` prefix. */
  cadenceRule: string;
  /** IANA time zone the rule is evaluated in. */
  timezone: string;
  /** Anchor date (any time component is ignored). */
  startsOn: Date;
  durationMinutes: number;
}

export interface OccurrenceSlot {
  scheduledStart: Date;
  scheduledEnd: Date;
}

/** Format a Date's calendar day (UTC) as `YYYYMMDD` for a DTSTART line. */
function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function normaliseRule(rule: string): string {
  return rule.trim().replace(/^RRULE:/i, "");
}

/**
 * Build the rule engine for a ceremony. DTSTART is `startsOn` at midnight in
 * the ceremony's zone; the RRULE's BYHOUR/BYMINUTE (when present) place each
 * tick at the meeting time.
 */
export function buildRule(cadence: CadenceDefinition): RRuleTemporal {
  const rruleString = `DTSTART;TZID=${cadence.timezone}:${ymd(cadence.startsOn)}T000000\nRRULE:${normaliseRule(cadence.cadenceRule)}`;
  return new RRuleTemporal({ rruleString });
}

function toSlot(epochMs: number, durationMinutes: number): OccurrenceSlot {
  const scheduledStart = new Date(epochMs);
  return {
    scheduledStart,
    scheduledEnd: new Date(epochMs + durationMinutes * 60_000),
  };
}

/**
 * Every cadence tick with `windowStart <= scheduledStart <= windowEnd`, in
 * order, never before `startsOn`. Overlapping windows return overlapping
 * results by design — the unique constraint de-duplicates on write.
 */
export function expandOccurrences(
  cadence: CadenceDefinition,
  windowStart: Date,
  windowEnd: Date,
): OccurrenceSlot[] {
  if (windowEnd < windowStart) return [];
  const rule = buildRule(cadence);
  const seen = new Set<number>();
  const slots: OccurrenceSlot[] = [];
  for (const hit of rule.between(windowStart, windowEnd, true)) {
    const ms = hit.epochMilliseconds;
    if (seen.has(ms)) continue;
    seen.add(ms);
    slots.push(toSlot(ms, cadence.durationMinutes));
  }
  return slots;
}

/** The first cadence tick strictly after `after`, or null when the rule is exhausted. */
export function nextOccurrence(cadence: CadenceDefinition, after: Date): OccurrenceSlot | null {
  const rule = buildRule(cadence);
  const next = rule.next(after);
  return next ? toSlot(next.epochMilliseconds, cadence.durationMinutes) : null;
}

/** Rolling window the hourly cron and the create mutation both expand. */
export const OCCURRENCE_WINDOW_DAYS = 14;

export function occurrenceWindow(now: Date, days = OCCURRENCE_WINDOW_DAYS): { start: Date; end: Date } {
  return { start: now, end: new Date(now.getTime() + days * 86_400_000) };
}
