# Password credentials live in their own table, not on `User`

Status: accepted

When email+password sign-in lands, the password hash and its lifecycle
metadata go into a dedicated 1:1 table keyed by `userId` rather than a
`User.passwordHash` column. The reason is exposure, not tidiness: `User` rows
are routinely returned unfiltered in this codebase — `db.user.findUnique(...)`
with no `select`, and `include: { user: true }` in `team.create` — so any
secret held on `User` is one careless include away from the wire, permanently,
guarded only by every future developer remembering to write `select`. In a
separate table the hash is structurally unreachable unless code explicitly
joins it, which makes the safe thing the default thing.

## Considered options

- **`User.passwordHash` column** — the obvious choice, and how most Auth.js
  examples do it. Rejected on the exposure argument above. It would also add
  four-plus columns (hash, updated-at, failed-attempt count, locked-until) to a
  table already carrying a pending V4 field-drop.
- **An `Account` row with `provider: "credentials"`** — superficially
  consistent with how OAuth identities are stored. Rejected: a password has no
  external provider and no meaningful `providerAccountId`, so we would be
  inventing a synthetic value to satisfy a unique constraint that exists for a
  different purpose, and storing a secret in a table the Prisma adapter writes
  to on its own schedule. This is the same mistake as `VerificationToken` being
  overloaded as the API-key store, which we are already living with.

The precedent is `ExternalAgentKey` (ADR-0049), which likewise holds its
`keyHash` in its own table rather than hanging it off the principal.

## Consequences

A password is therefore **not** an `Account` in this codebase's vocabulary.
Human sign-in methods now come in two shapes — provider-backed (`Account`) and
secret-backed (this table) — and `CONTEXT.md` reserves "Account" for the
former. Login pays one extra join, which is irrelevant on a non-hot path.
