# Connected calendars are a separate concept from auth identities

## Status

Accepted — 2026-06-09

## Context

A user must be able to connect **multiple** external calendars to their account — including a Google account that is *also* someone else's Exponential login. The motivating case: signed in as `jamespfarrell@gmail.com`, connect `email@jamesfarrell.me`'s calendar, **without** affecting `email@jamesfarrell.me`'s own user/login.

Calendar OAuth tokens were being stored on the NextAuth **`Account`** table — the same table that backs sign-in. That table is owned by the adapter: `PrismaAdapter.getUserByAccount` resolves a login via `account.findUnique({ where: { provider_providerAccountId } })`, so `@@unique([provider, providerAccountId])` is **global and load-bearing for authentication**. Consequences of staying on `Account`:

- A given external account can belong to **exactly one** Exponential user. It cannot simultaneously be user B's login *and* a calendar source for user A.
- Connecting a calendar that's also a login would either collide on the unique, silently reassign the row across users (account takeover), or get blocked by a cross-user guard — none of which is "attach B's calendar to A".
- Signing in with Google **overwrites `Account.scope`**, silently stripping calendar grants (observed in production: many rows reduced to `openid email profile`).

## Decision

Introduce **`ConnectedAccount`** — an external OAuth account (Google/Microsoft) a `User` links for **data access**, separate from the auth `Account`.

1. **Owned by the linking user, keyed by `@@unique([userId, provider, providerAccountId])`.** `providerAccountId` is deliberately **not** globally unique: the same external account can be connected by many users independently, and one user can connect many. This is exactly what makes the motivating case expressible.
2. **Feature-neutral.** A `ConnectedAccount` *is* the external account (tokens + granted scopes), not a calendar. Calendar is the first consumer; Contacts/Gmail migrate onto it later. Hence the name is not `CalendarConnection`.
3. **`CalendarPreference` FKs `ConnectedAccount`** (`connectedAccountId`, unique, cascade) instead of `Account`.
4. **OAuth callback splits by `scopeType`.** `type=calendar` → upsert `ConnectedAccount` on `(userId, provider, providerAccountId)`, no cross-user guard. `type=contacts|crm` → legacy `Account` path, unchanged (CRM still reads `Account` via `GoogleTokenManager`).
5. **Disconnect = hard-delete** the `ConnectedAccount` row (cascades its preference). It's never a sign-in identity, so there's nothing to preserve.
6. **No token migration.** Every legacy calendar grant lacked `calendar.readonly` and had dead tokens, so a reconnect is forced regardless. The migration is purely structural; existing `CalendarPreference` rows are cleared and rebuilt (default = primary) on first reconnect.
7. **"Calendar connected" derives from `ConnectedAccount` everywhere** (calendar router, onboarding step, settings, drawer); CRM/Contacts/Gmail signals stay on `Account`.

## Considered alternatives

- **Reuse `Account`, relax to `@@unique([userId, provider, providerAccountId])`.** Rejected: breaks NextAuth — `getUserByAccount` looks up by the global `provider_providerAccountId`; two rows for one external account makes sign-in ambiguous/broken.
- **Keep `Account`, add a cross-user guard.** Rejected: the guard *blocks* the motivating case (connecting an account that's also a login) — it can only ever refuse or take over, never "attach".
- **Calendar-only table (`CalendarConnection`).** Rejected: calendar/Contacts/Gmail ride one Google grant on one account; a calendar-only table re-creates the coupling and forces a second migration when CRM needs the same decoupling.
- **Dual-write `Account` + `ConnectedAccount`.** Rejected: two token copies of one grant drift on refresh.

## Consequences

- New `ConnectedAccount` model; `CalendarPreference.accountId` → `connectedAccountId`.
- Calendar services/router/callbacks resolve tokens from `ConnectedAccount`; CRM stays on `Account` until a later migration (known interim gap: a *CRM*-flow connection won't appear in the calendar sidebar, since it lands in `Account`).
- All existing calendar users must reconnect once (forced anyway by the missing `calendar.readonly` scope + expired tokens).
- Sign-in can no longer clobber calendar tokens — they live in a table NextAuth never writes.
- CONTEXT.md gains a "Connected account" term under Identity.
