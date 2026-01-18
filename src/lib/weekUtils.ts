/**
 * Get the start of the week (Sunday) for a given date in UTC.
 * Used for weekly review completion tracking.
 *
 * Uses UTC to ensure consistent week boundaries regardless of server timezone.
 * This prevents issues where a user completing a review near midnight in their
 * timezone might get assigned to a different week depending on server location.
 *
 * @param date - Reference date
 * @returns Date object set to Sunday 00:00:00 UTC of the week
 */
export function getSundayWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, etc. (UTC)
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if two dates fall within the same week (Sunday-Saturday).
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  const week1 = getSundayWeekStart(date1).getTime();
  const week2 = getSundayWeekStart(date2).getTime();
  return week1 === week2;
}
