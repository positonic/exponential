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

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function nextSaturday(from: Date): Date {
  const daysUntilSat = (6 - from.getDay() + 7) % 7;
  return addDays(from, daysUntilSat === 0 ? 7 : daysUntilSat);
}
