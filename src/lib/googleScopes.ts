/**
 * Google OAuth scope registry — pure constants and URL helpers, safe to
 * import from client components (no server imports; `~/lib/googleAuth`
 * layers the db-backed helpers on top and re-exports everything here).
 *
 * Google's OAuth verification requires a STRICT string match between the
 * scopes the app requests in its authorization URIs and the scopes registered
 * on the Cloud Console consent screen (Data Access) — the review fails when
 * they diverge by even one scope. Any change to these sets must be mirrored
 * in the Console configuration and re-demonstrated to Google.
 */

/**
 * Identity scopes requested alongside every set. Without these the
 * `oauth2/v2/userinfo` call returns 401, so the OAuth callback can't read the
 * Google account id/email it needs to upsert the Account by
 * (provider, providerAccountId). These are non-sensitive and don't affect
 * Google's verification tier. They also make the calendar account's
 * providerAccountId match the one stored at NextAuth sign-in, so reconnecting
 * dedupes onto the same row instead of creating a duplicate.
 */
const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

// Calendar access, kept to the narrowest granular scopes that cover the two
// Calendar API surfaces the app uses. `calendar.events` grants read/write of
// events on any calendar the user can access (events.list / events.insert),
// but it does NOT permit `calendarList.list` — the multi-calendar sidebar
// needs `calendar.calendarlist.readonly` to enumerate the user's calendars.
// The broad `calendar.readonly` ("see and download any calendar") is
// deliberately NOT requested: Google's least-privilege review rejected it.
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

/**
 * Google OAuth scope sets for incremental authorization.
 *
 * We use incremental authorization to minimize permissions requested during onboarding:
 * - "calendar": Only calendar access (sensitive scopes)
 * - "contacts": Calendar + Contacts, for the CRM contact import (sensitive scopes)
 */
export const GOOGLE_SCOPE_SETS = {
  calendar: [
    ...GOOGLE_IDENTITY_SCOPES,
    ...GOOGLE_CALENDAR_SCOPES,
  ],
  contacts: [
    ...GOOGLE_IDENTITY_SCOPES,
    ...GOOGLE_CALENDAR_SCOPES,
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
} as const;

export type GoogleScopeType = keyof typeof GOOGLE_SCOPE_SETS;

/**
 * Individual Google OAuth scopes used in the application.
 *
 * No Gmail scope on purpose: the app has no Gmail API integration (email sync
 * is IMAP-based via app passwords), and `gmail.readonly` is a RESTRICTED
 * scope whose verification requires a CASA security assessment. Do not add it
 * back without a feature that actually calls the Gmail API.
 */
export const GOOGLE_SCOPES = {
  CALENDAR: "https://www.googleapis.com/auth/calendar.events",
  CONTACTS: "https://www.googleapis.com/auth/contacts.readonly",
} as const;

/**
 * Get the OAuth URL for requesting additional scopes
 *
 * @param scopeType - The scope set to request
 * @param returnUrl - Where to redirect after authorization
 */
export function getGoogleAuthUrl(
  scopeType: GoogleScopeType,
  returnUrl: string
): string {
  const params = new URLSearchParams({
    type: scopeType,
    returnUrl,
  });
  return `/api/auth/google-calendar?${params.toString()}`;
}
