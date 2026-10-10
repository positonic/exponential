# Sign-in codes replace magic links, because corporate mail scanners eat links

Status: accepted

Email sign-in delivers an 8-character Crockford base32 **Sign-in code** that the
user types, and no link at all. Corporate mail security — Mimecast URL Protect
and equivalents — rewrites and follows URLs in email, and a NextAuth email
token is single-use (the Prisma adapter deletes the `VerificationToken` on
first use), so the scanner spends the token and the human gets "invalid or
expired link". This was observed against a real user at an NGO whose mail runs
through Mimecast. A typed code has no URL to follow, so nothing can spend it on
the user's behalf.

This is also what makes password sign-in reachable at all. Passwords can only
be attached to an account that already exists (ADR-0055), so a user who cannot
complete an email sign-in can never obtain an account, never set a password,
and has no route in — which is precisely the cohort passwords exist to serve.
The code had to be fixed first.

## Considered options

- **Keep the link, add a code alongside it in the same email.** Better for the
  majority whose mail is not scanned — click if it works, type if it doesn't.
  Rejected for the extra machinery: two independent credentials per sign-in
  attempt, cross-invalidation when either is used, and a busier email. If they
  had instead shared one token row the scanner would have killed both, which is
  the worst outcome because the email still looks usable.
- **Link plus a confirmation button on the landing page**, on the theory that a
  scanner issues a GET and won't submit a form. Rejected: the observed scanner
  performs click-time scanning and renders the destination page. A mitigation
  that fails silently is worse than no mitigation.

## Consequences

The code **is** the Auth.js email verification token, not a parallel system:
`generateVerificationToken` replaces the default `randomString(32)`. This is
deliberate and load-bearing — it keeps the token hashed at rest and single-use,
and keeps the ordinary callback creating the user and firing `events.createUser`
(personal workspace bootstrap and pending-invite acceptance). A hand-rolled
credentials flow would have silently skipped all of it.

Security rests on **entropy rather than throttling**. Verification lands on
Auth.js's own `/api/auth/callback/*` route, which has no rate limiting and is
excluded from the `middleware.ts` matcher, so it cannot be throttled without
wrapping the handler. Eight base32 characters (~10^12) survives being guessed
at unthrottled; a 6-digit PIN (10^6) would not. Crockford's alphabet omits
`I`, `L`, `O` and `U`, so nothing is misread off a phone screen.

Cost: users whose mail is not scanned lose one-click sign-in and now type eight
characters. Accepted — the feature exists for the users whose mail *is*.
