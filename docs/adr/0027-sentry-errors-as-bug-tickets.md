# Sentry errors enter as Bug Tickets via a signed webhook, authored by the Errol system user

## Status

Accepted — 2026-06-19. Builds on the external-webhook-writes-to-Ticket pattern of
[ADR-0021](0021-pr-merge-promotes-ticket-via-app-webhook.md) and deviates, deliberately,
from [ADR-0016](0016-agent-activity-writes-reuse-human-path.md) on attribution.

## Context

Sentry (`@sentry/nextjs`, production-only) captures runtime errors but there was no path from
a captured error to a tracked work item — bugs lived only in Sentry. We want each new Sentry
issue to become a triageable item in Exponential.

The glossary is unambiguous that a **bug** is a **Ticket** with `type: BUG` (strictly distinct
from an **Action**, a meeting-extracted task, and from a **Problem**, a product-strategy
artefact the glossary keeps bug-free). The first cut built it as an Action against a Project,
because `action.quickCreate` was an existing keyed endpoint — that was rejected as off-model.

Two constraints shaped the rest:
- `Ticket` belongs to a **Product** (required `productId`) and needs an atomic per-product
  `number` + fun `shortId` + an activity-feed write — non-trivial create logic that already
  exists in **two** copies (the product UI's `ticket.create` and `mastra.createTicket`).
- `Ticket` has no `sourceType`/`sourceId` (Action does), and `Ticket.createdById` is a
  required FK to a real `User` — there is no system/bot-user concept in the model.

## Decision

1. **Sentry → Ticket(`BUG`).** A signed inbound webhook at `/api/webhooks/sentry` files each
   new Sentry issue as a `Ticket` with `type: BUG`, `status: BACKLOG`, in the **Exponential**
   Product. BACKLOG (not `READY_TO_PLAN`) because raw Sentry signal is unvalidated — a human
   triages it. The webhook handles the `issue`/`created` and `event_alert`/`triggered`
   resources; both key on the Sentry issue id.

2. **Verify, don't tokenise.** Sentry signs the raw body with HMAC-SHA256 (its integration
   Client Secret, in `SENTRY_WEBHOOK_SECRET`); the route verifies the `Sentry-Hook-Signature`
   header. One-way verification, like the GitHub webhook — no token is issued to Sentry, and
   this is *not* an `Integration` row (that model, per [ADR-0020](0020-agent-integration-callback-not-token.md),
   is for agent-used outbound credentials, not a single global inbound hook).

3. **One shared ticket-create service.** The counter-increment / shortId / `recordActivity` /
   create logic is extracted into a single service that the webhook, the product UI mutation,
   and `mastra.createTicket` all call — collapsing the existing duplication, as
   [ADR-0016](0016-agent-activity-writes-reuse-human-path.md) prescribes for automated writers.

4. **Dedup in `Ticket.links`, migration-free.** One Ticket per Sentry issue, deduped on the
   Sentry issue id stored in `Ticket.links` (`{ sentryIssueId, sentryUrl }`) and matched with a
   JSON-path query — the same JSON-filtering pattern the activity feed uses on
   `metadata.provider`. No migration, so this ships fast-track. Trade-off: no unique index, so a
   rare double-fire can duplicate (delete-the-dupe is acceptable; a `sourceType`/`sourceId`
   column with a unique index is the documented upgrade if it bites).

5. **Authored by the Errol system user — a deliberate deviation from ADR-0016.** ADR-0016
   attributes automated writes to the *acting user* because Zoe writes inside a user's session.
   **Sentry has no user session** — there is no human actor to attribute to. So `createdById`
   points at **Errol**, a real `User` row (env-configured email/name, find-or-created lazily)
   that never signs in. Errol is **not** a `WorkspaceUser`, so its `created` activity events do
   not surface in the member Activity feed — accepted, since it keeps Sentry noise out of the
   feed.

## Considered alternatives

- **File bugs as Actions in a Project** (the first cut). Rejected: contradicts the glossary —
  a bug is a Ticket, not a meeting-extracted Action.
- **Attribute to a real owner + Sentry provenance in the body** (strict ADR-0016). Rejected by
  the owner in favour of a clear "Sentry filed this" identity; pinning a bug nobody filed on a
  real human read as dishonest.
- **Make Errol a workspace member** so its activity surfaces. Rejected: we *want* Sentry
  bug-creation kept out of the member feed; non-membership gives that for free.
- **Add `sourceType`/`sourceId` columns to Ticket** (mirror Action, race-proof dedup). Deferred:
  it is a migration; `links` JSON is enough for v1.

## Consequences

- A new `Errol` system-user concept exists in the model (glossary term added). Future
  external-source writers with no human actor can reuse it rather than inventing more identities.
- Ticket-create logic now has one shared service; the two legacy copies are rewired onto it.
- Dedup is best-effort (no DB constraint) until/unless the `sourceType`/`sourceId` upgrade lands.
- `SENTRY_WEBHOOK_SECRET`, `SENTRY_BUG_PRODUCT_ID`, `SENTRY_BOT_EMAIL`, `SENTRY_BOT_NAME` are the
  new env knobs; the route must be deployed before the Sentry integration is saved (Sentry sends
  a verification POST on save).
