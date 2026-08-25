// Format date like "22 Feb"
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// Format scheduled time like "9:00 AM"
export function formatScheduledTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatClockTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatAprDay(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function hourFloat(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

export function formatHourLabel(h: number): string {
  const hr = Math.floor(h);
  const disp = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  const suffix = hr >= 12 ? "PM" : "AM";
  return `${disp} ${suffix}`;
}

export function formatHourMinute12(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const suffix = hr >= 12 ? "PM" : "AM";
  const disp = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${disp}:${String(min).padStart(2, "0")} ${suffix}`;
}

// Relative age of an overdue item, e.g. "due yesterday" / "due 5d ago".
// Day-normalized before diffing so DST 23/25-hour days round correctly;
// clamps to 1 day since callers only pass anchors strictly before today.
export function formatRelativeDueAge(anchor: Date, today: Date): string {
  const MS_DAY = 86_400_000;
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.round((t.getTime() - a.getTime()) / MS_DAY));
  return days === 1 ? "due yesterday" : `due ${days}d ago`;
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function nextSaturday(from: Date): Date {
  const daysUntilSat = (6 - from.getDay() + 7) % 7;
  return addDays(from, daysUntilSat === 0 ? 7 : daysUntilSat);
}

/**
 * Midnight at the start of `base`'s day, in the *viewer's* timezone.
 *
 * Deliberately computed on the client. `partitionActions` buckets by comparing
 * `startOfDay` values in the viewer's zone, so a day boundary picked on the
 * server would be the server's midnight — UTC on Vercel — and every user west
 * of UTC would see a reschedule land on the previous day.
 */
export function startOfLocalDay(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}
