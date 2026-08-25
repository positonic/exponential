/**
 * "Today" as a [start, end) UTC window, interpreted in the user's IANA
 * timezone when known — so an Auckland user's 22:00 event is part of *their*
 * today, not UTC's. Falls back to server-local midnight (the pre-existing
 * provider-service convention) when no timezone is stored.
 */

/** Milliseconds the zone is ahead of UTC at `date` (DST-aware). */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some ICU versions render midnight as "24".
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function todayWindow(
  timeZone: string | null,
  now: Date = new Date(),
): { start: Date; end: Date } {
  if (!timeZone) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  const offsetNow = tzOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offsetNow);
  const localMidnightAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  // The offset can differ at midnight vs now (DST transition day) — refine
  // once with the offset at the first guess.
  const guess = new Date(localMidnightAsUtc - offsetNow);
  const start = new Date(localMidnightAsUtc - tzOffsetMs(guess, timeZone));
  // A flat +24h is off by an hour on the two DST-change days; fine for an
  // event-overlap window.
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
