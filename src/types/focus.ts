/**
 * Time-based focus period for filtering content on the Today page
 */
export type FocusPeriod = "today" | "tomorrow" | "week" | "month";

/**
 * Date range for filtering actions and outcomes
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Valid focus periods for runtime validation
 */
export const VALID_FOCUS_PERIODS: FocusPeriod[] = ["today", "tomorrow", "week", "month"];

/**
 * Type guard to check if a string is a valid FocusPeriod
 */
export function isValidFocusPeriod(value: string | null | undefined): value is FocusPeriod {
  return value != null && VALID_FOCUS_PERIODS.includes(value as FocusPeriod);
}
