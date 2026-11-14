# First-run setup token, then invite-only sign-up

## Status

Accepted — 2026-11-11 (James). Self-hosting feature, ticket sunny.stork. Replaces the open
sign-up accepted on 2026-10-28 as a stopgap, and narrows `AUTH_LOG_SIGN_IN_CODES` (#1027).

## Context

A self-host install had open sign-up and no admin: anyone who reached the URL and completed a
sign-in got an account, and with no email transport, log delivery let anyone who could read the
log sign in as anyone (PR-Agent flagged it on #1027). Plane-style installs fix this by making
the first person to set the install up its admin and then locking sign-up. But a Railway URL is
public the moment it deploys, so "first visitor wins" hands the install to whoever opens it
first, which could be a scanner or a stranger rather than the operator.

## Decision

1. **A one-time setup token, not first-visitor-wins.** While no `User.isAdmin` exists,
   `start:selfhost` prints a fresh token on every boot. Only its SHA-256 is stored, in the
   single `InstanceSettings` row. It is single-use, expires after 24 hours and is replaced on
   the next boot. `/setup` takes an email plus the token, creates or promotes that user as the
   **Instance admin** and signs them in through a `setup` credentials provider, with no email
   transport. Holding the token proves you can read the boot log, which only the operator can.
2. **`/setup` exists only while the install is unclaimed**: a live token *and* no instance
   admin. Otherwise it is a 404, and `/signin` redirects to it only in that window. A dev
   database with no admins still has no token, so local sign-in is unaffected.
3. **Sign-up mode** (`open` | `invite-only`) on `InstanceSettings.signUpMode`. No value means
   `open`. Claiming sets `invite-only`, and an instance admin can change it in `/admin`. The
   Auth.js `signIn` callback enforces it only for sign-ins that would create an account (an
   email sign-in is refused before a code is sent), and admits an address with a pending
   workspace or team invitation.
4. **Log delivery is for instance admins only.** With no email transport, a code request from
   anyone else is refused with copy saying email sign-in isn't set up, and `deliverSignInCode`
   never logs another user's code.
5. **exponential.im is unchanged.** It never runs `start:selfhost`, so it has no settings row
   and no token: `/setup` is a 404 and sign-up stays open. Tests pin both.

## Considered and rejected

- **First visitor becomes admin** (Plane): unsafe on a URL that is public at deploy time.
- **An `ADMIN_EMAIL` env var**: still needs a way to prove control of that address, which means
  an email transport, the thing a minimal install doesn't have.
- **An admin screen for SMTP/OAuth settings** (Plane's "God mode"): out of scope; those stay
  environment variables.

## Consequences

- Railway and Docker deploys land on `/setup`, not on open sign-up.
- An admin who signs out needs `AUTH_LOG_SIGN_IN_CODES`, email or OAuth to get back in.
- If every admin loses `isAdmin`, the next boot prints a token again, which doubles as recovery.
- Concurrent starts each write a token; only the last one printed works. Self-host installs run
  one app replica, so this is accepted rather than locked.
