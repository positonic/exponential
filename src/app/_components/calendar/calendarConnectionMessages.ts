/**
 * Single source of truth for `calendar_error` codes.
 *
 * The codes are emitted by `/api/auth/google-calendar/callback` and
 * `/api/auth/microsoft-calendar/callback`, and rendered on several surfaces
 * (the calendar page's `useCalendarConnectionToast`, plus the
 * GoogleCalendarConnect / MicrosoftCalendarConnect buttons on
 * settings/integrations, ProjectCalendarCard and CreateMeetingModal). Keeping
 * the mapping here means adding a code server-side is one edit, not four —
 * previously the copies had already drifted, and `account_linked_elsewhere`
 * fell through to the generic message on every surface.
 */
const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "Calendar access was denied. Please try again and grant permissions.",
  invalid_request: "Invalid request. Please try connecting again.",
  no_refresh_token:
    "Failed to get long-term access. Please try connecting again.",
  token_exchange_failed: "Failed to connect calendar. Please try again.",
  no_google_account:
    "Please sign in with Google first, then connect your calendar.",
  account_linked_elsewhere:
    "That Google account is already connected to a different user. Sign in as that user, or connect a different Google account.",
};

/**
 * Resolves a `calendar_error` code to a human message.
 *
 * `fallback` carries the provider name for unrecognised codes, so a button
 * that only ever connects Outlook doesn't apologise about "calendar" in the
 * abstract. Callers pass their own.
 */
export function getCalendarErrorMessage(
  code: string,
  fallback = "Failed to connect calendar.",
): string {
  return CALENDAR_ERROR_MESSAGES[code] ?? fallback;
}
