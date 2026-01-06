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
