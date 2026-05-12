import {
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns';

export function isoWeekStringFromDate(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function dateFromIsoWeekString(value: string): Date | null {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  let d = new Date(year, 0, 4); // Jan 4 always falls inside ISO week 1
  d = setISOWeekYear(d, year);
  d = setISOWeek(d, week);
  return startOfISOWeek(d);
}
