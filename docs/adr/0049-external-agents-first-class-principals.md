# External agents are first-class principals (shadow User + revocable keys), not user-impersonators

## Status

Accepted — 2026-08-03

## Context

A user wants to point third-party autonomous agent software — the trigger was Nous
Research's **Hermes Agent**, self-hosted software with a built-in MCP/HTTP client — at
Exponential to manage their tasks. Today every credential path in the app resolves to a
human `User`: `createTRPCContext` verifies a bearer JWT, looks up the `User` row, and
fabricates a session *as that person*. There is no way to authenticate software except by
handing it a token that fully impersonates its owner.

Two agent-identity patterns already exist, and neither fits:

- **Zoe acts as the user** ([ADR-0016](0016-agent-activity-writes-reuse-human-path.md)):
  correct because a confirming human is in the loop (draft-and-confirm) — the human
  genuinely is the author.
- **The Sentry synthetic user** ([ADR-0027](0027-sentry-errors-as-bug-tickets.md)): a real
  `User` row that never signs in, deliberately *not* a workspace member so its telemetry
  writes stay out of the activity feed — correct because there is no human actor at all.

Hermes-class agents sit in the gap: **owned by a human, but acting autonomously without
per-action confirmation**. Attributing their writes to the owner is a lie ("James created
this action" when James was asleep), and the impersonation token itself is dangerous — our
JWTs are stateless and individually unrevocable (the `device-token` comment in
`src/server/api/routers/auth.ts` admits this), which is unacceptable for a credential that
lives inside third-party software on hardware we don't control. This is also a new trust
posture relative to [ADR-0020](0020-agent-integration-callback-not-token.md) ("the
credential never enters the LLM context"): here the credential *necessarily* lives in the
external agent's config.

## Decision

1. **A new principal type: the External agent.** `ExternalAgent` is user-owned
   (`ownerId → User`) and workspace-joined. Scope is deliberately narrow: external
   autonomous software only. Zoe, the gateways, and internal actors stay on ADR-0016's
   acts-as-user convention; Sentry keeps its synthetic user. This ADR supersedes nothing.

2. **Each agent gets a shadow `User` row** (`User.isAgent = true`, no login method), the
   Sentry precedent generalized. Every FK (`Action.createdById`), access path
   (`buildActionAccessWhere`, membership middleware), and audit surface works unchanged —
   the alternative (threading a second principal type through `ctx.session.user.id`
   everywhere) is a rewrite.

3. **Workspace membership is real and delegated.** The agent's shadow user gets ordinary
   `WorkspaceUser` rows, granted self-serve by the owner (delegation parity — the same
   "wherever the user's own hands could" principle as ADR-0016). Role is fixed to
   `member`: never `admin`/`owner` (agents don't manage people or settings), and no
   `viewer` tier until server-side role enforcement is hardened — offering "read-only" to
   autonomous software while viewer gating is client-side would advertise a boundary that
   doesn't hold.

4. **The delegation invariant, enforced structurally: an agent's access never exceeds or
   outlives its owner's.** The workspace-membership mutation paths cascade: removing a
   human from a workspace removes their agents' memberships there; demoting a human
   re-caps their agents' roles. Structural (rows stay ordinary, all SQL paths untouched)
   rather than dynamic (`min(agent, owner)` at read time), because membership mutations
   are rare and centralized while access checks are the hottest path.

5. **Credentials are opaque hashed API keys, not JWTs.** High-entropy key with a
   distinctive prefix (`exp_agent_`), SHA-256 hash stored in `ExternalAgentKey`, shown
   once at creation, multiple keys per agent (rotation), nullable `expiresAt`,
   `lastUsedAt` tracking. `createTRPCContext` recognizes the prefix and resolves
   key → agent → shadow-user session. Revocation is a row delete, effective next request.
   No exchange-for-JWT flow: the JWT path already does a per-request `db.user.findUnique`,
   so statelessness buys nothing here, and a static bearer keeps generic MCP/HTTP clients
   plug-and-play.

6. **Blast radius: full procedure surface minus a principal-level denylist.** Agent
   sessions reach every `protectedProcedure` *except* areas guarded by a shared
   human-only middleware keyed on `session.user.isAgent` (not on token type): every
   JWT-minting procedure (closing the credential-laundering hole — exchanging a revocable
   key for an unrevocable stateless JWT), workspace-membership mutations,
   integration/credential management, and agent/key management itself. Keying on the
   principal means even a laundered token still can't mint further credentials.

7. **Full visibility.** Agent writes attribute to the shadow user (`createdById`), appear
   in the activity feed and members list (giving workspace admins an eviction lever
   independent of the owner's key management), carry `Action.source: "agent"` via the
   existing tokenType attribution path, and render with an agent badge in the members
   list and feed. The Sentry feed-exclusion precedent doesn't conflict: suppress when
   writes are telemetry, surface when they're work.

## Considered alternatives

- **Agents register their own accounts.** Rejected: OAuth-only auth means an agent owning
  an inbox; no owner, no offboarding chain, an auto-created Personal workspace for a
  robot. The industry abandoned bot-user accounts (GitHub Apps replaced them) for
  exactly these reasons.
- **Formalize acts-as-user tokens (long-lived `api-token` JWTs).** Rejected as the
  destination (kept only as the Phase 1 stopgap): wrong attribution, full owner powers in
  every workspace, and stateless-JWT revocation is a global kill switch, not per-token.
- **`ServiceAccount` naming.** Precise but hides the product story; users meet this as
  "connect your agent." **`Agent`** and **`UserAgent`** rejected for vocabulary collision
  — `Agent` against five existing meanings (Zoe, Mastra, PM Agent, mentions, agent
  quality), `UserAgent` against 20 existing browser-UA usages.
- **Procedure-level allowlist (true least privilege).** Deferred, not rejected: it means
  auditing hundreds of procedures now, and every new feature ships agent-broken by
  default. The denylist keeps new features working while closing the escalations that
  matter. Revisit if agent diversity demands per-agent scopes.
- **Dynamic subset enforcement** (`min(agent role, owner role)` per access check).
  Rejected: breaks the "shadow user flows through existing SQL unchanged" property for a
  drift case the centralized mutation path already prevents.

## Consequences

- New models `ExternalAgent` + `ExternalAgentKey`; `User.isAgent` flag; migration.
- `createTRPCContext` gains a key-prefix branch; a shared `humanOnly` middleware guards
  the denylisted routers; workspace-membership mutations gain cascade hooks.
- `/settings/agents` (user settings — agents are user-owned) manages agents, keys, and
  workspace grants; the workspace members list shows agents with a badge.
- Deferred, recorded: viewer tier (blocked on server-side role-enforcement hardening),
  workspace-owned shared agents, per-agent scopes, per-key rate limiting, badges on every
  user chip, migrating internal actors onto agent principals.
- CONTEXT.md gains the **External agent** glossary entry.
