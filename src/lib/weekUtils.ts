/**
 * Get the start of the week (Sunday) for a given date.
 * Used for weekly review completion tracking.
 *
 * @param date - Reference date
 * @returns Date object set to Sunday 00:00:00 of the week
 */
export function getSundayWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
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
