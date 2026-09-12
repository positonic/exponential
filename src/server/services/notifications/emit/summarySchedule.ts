/**
 * The two facts the Summary schedule card (Settings → Notifications) and the
 * cron scheduler must agree on. Pure, so the router can import it without
 * pulling in the emit pipeline.
 */

/** Local time a daily digest fires when the user has never picked one. */
export const DEFAULT_SUMMARY_TIME = "09:00";

/**
 * The zone a user's summary times are read in. `User.timezone` (Settings →
 * Profile, also set by the calendar timezone checkpoint) is the one place a
 * person tells us where they are, so it wins; the preference row's own
 * `timezone` column predates it and is only ever the "UTC" default now.
 */
export function resolveSummaryTimezone(pref: {
  timezone: string | null;
  user?: { timezone: string | null } | null;
}): string {
  return pref.user?.timezone ?? pref.timezone ?? "UTC";
}
