import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  isSameMonth,
  isSameYear,
  addDays,
} from "date-fns";
import { TRPCError } from "@trpc/server";
import type { FocusPeriod, DateRange } from "~/types/focus";

/**
 * Get the date range for a given focus period
 */
export function getDateRangeForFocus(focus: FocusPeriod, referenceDate: Date = new Date()): DateRange {
  switch (focus) {
    case "today":
      return {
        startDate: startOfDay(referenceDate),
        endDate: endOfDay(referenceDate),
      };
    case "tomorrow": {
      const tomorrow = addDays(referenceDate, 1);
      return {
        startDate: startOfDay(tomorrow),
        endDate: endOfDay(tomorrow),
      };
    }
    case "week":
      return {
        startDate: startOfWeek(referenceDate, { weekStartsOn: 1 }), // Monday
        endDate: endOfWeek(referenceDate, { weekStartsOn: 1 }), // Sunday
      };
    case "month":
      return {
        startDate: startOfMonth(referenceDate),
        endDate: endOfMonth(referenceDate),
      };
  }
}

/**
 * Format the focus period as a display label
 */
export function formatFocusLabel(focus: FocusPeriod): string {
  switch (focus) {
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "week":
      return "This Week";
    case "month":
      return "This Month";
  }
}

/**
 * Format a date range for display in the page header
 */
export function formatDateRangeDisplay(focus: FocusPeriod, dateRange: DateRange): string {
  switch (focus) {
    case "today":
      return format(dateRange.startDate, "EEEE, MMMM d, yyyy");
    case "tomorrow":
      return format(dateRange.startDate, "EEEE, MMMM d, yyyy");
    case "week": {
      const start = dateRange.startDate;
      const end = dateRange.endDate;
      if (isSameMonth(start, end)) {
        return `${format(start, "MMMM d")} - ${format(end, "d, yyyy")}`;
      }
      if (isSameYear(start, end)) {
        return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
      }
      return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
    }
    case "month":
      return format(dateRange.startDate, "MMMM yyyy");
  }
}

/**
 * Get the title suffix for outcomes/actions sections
 */
export function getFocusSectionTitle(focus: FocusPeriod, baseTitle: string): string {
  switch (focus) {
    case "today":
      return `Today's ${baseTitle}`;
    case "tomorrow":
      return `Tomorrow's ${baseTitle}`;
    case "week":
      return `This Week's ${baseTitle}`;
    case "month":
      return `This Month's ${baseTitle}`;
  }
}

/**
 * Validates that scheduledEnd is not before scheduledStart.
 * Handles partial updates where only one value may be provided.
 */
export function validateScheduledTimes(
  start: Date | null | undefined,
  end: Date | null | undefined,
): void {
  if (start && end && end < start) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "scheduledEnd must not be before scheduledStart",
    });
  }
}

/**
 * Timezone-aware date utilities for server-side date manipulation.
 *
 * The problem: Server runs in UTC, but users expect times in their local timezone.
 * When server calls setHours(10), it sets 10:00 UTC, not 10:00 in user's timezone.
 *
 * Solution: Pass timezone offset from client and use UTC methods to set correct time.
 */

/**
 * Creates a date at a specific time in the user's timezone.
 *
 * @param baseDate - The base date (should already represent the correct day in user's timezone)
 * @param hours - Hour in user's local time (0-23)
 * @param minutes - Minutes (0-59)
 * @param timezoneOffsetMinutes - User's timezone offset from getTimezoneOffset()
 *   - Positive for west of UTC (e.g., PST = +480)
 *   - Negative for east of UTC (e.g., CET = -60)
 * @returns Date object representing the specified time in user's timezone
 *
 * @example
 * // User in CET (UTC+1) wants 10:00 AM on Jan 31
 * // timezoneOffset = -60 (from getTimezoneOffset())
 * const date = setTimeInUserTimezone(baseDate, 10, 0, -60);
 * // Result: Jan 31 09:00 UTC (which is 10:00 CET)
 */
export function setTimeInUserTimezone(
  baseDate: Date,
  hours: number,
  minutes: number,
  timezoneOffsetMinutes: number
): Date {
  const result = new Date(baseDate);

  // getTimezoneOffset() returns minutes that need to be ADDED to local time to get UTC
  // So to convert local time to UTC: UTC = local + offset
  // For CET (UTC+1): offset = -60, so 10:00 local → 10:00 + (-60 min) = 09:00 UTC ✓
  // For PST (UTC-8): offset = +480, so 10:00 local → 10:00 + 480 min = 18:00 UTC ✓

  // Calculate total minutes from midnight in user's local time
  const localMinutes = hours * 60 + minutes;

  // Convert to UTC minutes
  const utcMinutes = localMinutes + timezoneOffsetMinutes;

  // Handle day overflow/underflow
  let utcHours = Math.floor(utcMinutes / 60);
  let utcMins = utcMinutes % 60;

  // Handle negative minutes (when UTC time is before midnight)
  if (utcMins < 0) {
    utcMins += 60;
    utcHours -= 1;
  }

  // Handle day boundaries
  if (utcHours < 0) {
    result.setUTCDate(result.getUTCDate() - 1);
    utcHours += 24;
  } else if (utcHours >= 24) {
    result.setUTCDate(result.getUTCDate() + 1);
    utcHours -= 24;
  }

  result.setUTCHours(utcHours, utcMins, 0, 0);
  return result;
}

/**
 * Gets the start of day in user's timezone.
 * Useful when you need midnight in the user's local time.
 *
 * @param date - Any date
 * @param timezoneOffsetMinutes - User's timezone offset from getTimezoneOffset()
 * @returns Date object representing midnight in user's timezone
 */
export function startOfDayInUserTimezone(
  date: Date,
  timezoneOffsetMinutes: number
): Date {
  return setTimeInUserTimezone(date, 0, 0, timezoneOffsetMinutes);
}
