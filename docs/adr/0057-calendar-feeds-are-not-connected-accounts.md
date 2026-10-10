# Calendar feeds get their own table, not a ConnectedAccount row

Status: accepted

A **Calendar feed** — a per-user ICS subscription URL (e.g. an Outlook
published calendar) — is stored in its own `CalendarFeed` table, with the URL
encrypted at rest, and its events persisted into `CalendarEvent`.

ADR-0009 established that "it's the account, not the calendar": calendar
connections are `ConnectedAccount` rows because what the user links is an
OAuth account (tokens + scopes) that happens to expose calendars. That
rejection of a calendar-shaped table does **not** apply to feeds, because a
feed has no account behind it at all: no tokens, no scopes, no provider
identity, no refresh lifecycle. The only secret is the URL itself (an ICS
subscription URL is a bearer secret — anyone holding it can read the
calendar), which is why it is encrypted with `encryptToBase64` and never
returned to the client.

## Considered options

- **`ConnectedAccount` with a `"ics"` provider** — rejected: null tokens, a
  fabricated `providerAccountId`, and provider-kind branches in
  `isCalendarConnected` and every OAuth-shaped procedure. The two-value
  `providerSchema` enum stays untouched; ICS enters only at the read-path
  merges, as `provider: "ics"` in response payloads.
- **`Integration` row** — rejected: `Integration` is workspace/team-scopable
  and API-key-shaped, feeds are strictly per-user; `CalendarPreference`
  cannot reference it.
- **Dedicated `CalendarFeed`** — chosen. Feeds have no `CalendarPreference`
  row either; `isEnabled` on the feed is the only visibility toggle.

`CalendarEvent` (introduced alongside) is the app's first event persistence
layer: ICS feed events in V1, Google/Microsoft busy-time rows in V2, filled
by a cron sweep on a rolling −1 week / +8 weeks window. Cross-user reads of
this table are free/busy only — `startsAt`/`endsAt`/`isAllDay`/`sourceType`,
enforced at the Prisma select.
