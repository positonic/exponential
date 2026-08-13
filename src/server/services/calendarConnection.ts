/**
 * Shared helpers for deciding whether a ConnectedAccount row is a usable
 * calendar connection. Used by the calendar router (connection status UI) and
 * the availability router (team free/busy), so the two can never disagree
 * about what "connected" means.
 */

export type CalendarProviderType = "google" | "microsoft";

/** Maps our provider type to the NextAuth account provider name */
export function getAccountProvider(provider: CalendarProviderType): string {
  return provider === "microsoft" ? "microsoft-entra-id" : "google";
}

/** Maps a NextAuth account provider name back to our provider type */
export function toProviderType(accountProvider: string): CalendarProviderType {
  return accountProvider === "microsoft-entra-id" ? "microsoft" : "google";
}

/** The OAuth scope that grants calendar access for each provider */
export function calendarScopeFor(accountProvider: string): string {
  return accountProvider === "microsoft-entra-id"
    ? "Calendars.Read"
    : "https://www.googleapis.com/auth/calendar.events";
}

/** Whether an account currently has a usable (scoped + non-expired-or-refreshable) calendar connection */
export function isCalendarConnected(account: {
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  expires_at: number | null;
  provider: string;
}): boolean {
  if (!account.access_token) return false;
  const hasScope = account.scope?.includes(calendarScopeFor(account.provider)) ?? false;
  const tokenNotExpired =
    !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;
  const isTokenValid = tokenNotExpired || !!account.refresh_token;
  return hasScope && isTokenValid;
}
