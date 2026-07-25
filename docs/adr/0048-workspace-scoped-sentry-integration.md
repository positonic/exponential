# Sentry becomes a workspace-scoped Integration with a per-tenant signed webhook

## Status

Accepted — 2026-07-25. Amends decision point 2 of
[ADR-0027](0027-sentry-errors-as-bug-tickets.md) (the "single global inbound hook, *not* an
`Integration` row" stance). Everything else in ADR-0027 — bug-as-Ticket, Errol authorship,
`links`-based dedup, the shared ticket-create service — stands unchanged. Builds on the
workspace-scoped `Integration` pattern GitHub uses
([ADR-0020](0020-agent-integration-callback-not-token.md)).

## Context

[ADR-0027](0027-sentry-errors-as-bug-tickets.md) shipped Sentry ingestion as a single global
endpoint (`/api/webhooks/sentry`): one env secret (`SENTRY_WEBHOOK_SECRET`), one hardcoded
destination Product (`SENTRY_BUG_PRODUCT_ID`, defaulting to the Exponential product). Every
Sentry issue from every source lands in that one product. That was the right v1 — Exponential
was Sentry's only tenant — but it cannot serve more than one: there is no way to authenticate a
second Sentry source independently, nor to route different sources to different workspaces/products.

The app already models exactly this shape for other providers. `Integration` carries
`workspaceId`, a unique `webhookId`, and a `providerConfig` JSON blob; `IntegrationCredential`
stores per-integration secrets, encrypted via `credentialHelper`. GitHub uses `providerConfig`
for non-secret config and `IntegrationCredential` for its token, all scoped by `workspaceId`.
Sentry used none of it. No schema change is needed to adopt it — `webhookId` and `providerConfig`
already exist and (for `webhookId`) were previously unused.

The one wrinkle: every existing webhook receiver in the app is a *static* route that reverse-maps
the tenant from a globally-unique key in the payload (GitHub matches the repo full name). Sentry
payloads carry no reliable workspace key, and Sentry lets the user set an arbitrary webhook URL —
so the tenant has to travel in the URL, which means a dynamic route segment, a pattern the repo
did not yet have for webhooks.

## Decision

1. **Sentry is a workspace-scoped `Integration`.** `createSentryIntegration` (owner/admin only,
   transactional single-config-per-workspace replace, mirroring the Postmark procedures) creates
   an `Integration` with `provider: "sentry"`, `workspaceId`, a generated unique `webhookId`, and
   `providerConfig: { productId }` naming the destination Product (validated to belong to the
   workspace). The signing secret is stored as an encrypted `IntegrationCredential`
   (`keyType: "WEBHOOK_SECRET"`). `getWorkspaceSentryStatus` / `removeWorkspaceSentry` complete
   the trio; status never returns the secret. No migration — reuses existing columns.

2. **Per-tenant URL, not payload reverse-lookup.** A new dynamic route
   `/api/webhooks/sentry/[webhookId]` resolves the integration by its unique `webhookId` (one
   indexed lookup; unknown id or non-sentry provider → 404). Chosen over the GitHub-style
   static-route reverse-lookup because Sentry payloads have no dependable workspace key and the
   webhook URL is user-set. This is the first dynamic-segment webhook route in the app; the
   trade-off is a new pattern, accepted because the alternative (parsing org/project slugs out of
   the payload and hoping they map) is brittle.

3. **Per-integration HMAC, no shared env secret.** The route verifies `Sentry-Hook-Signature`
   against that integration's own decrypted secret (reusing `verifySentrySignature` from
   ADR-0027). A configured integration always has a secret, so — unlike the global route — there
   is no unauthenticated mode: a missing/undecryptable secret is a 401, not an open door.

4. **Destination product per workspace.** `ingestSentryBug` gains an optional `productId`;
   the dynamic route passes `providerConfig.productId`. Precedence is explicit-product →
   `SENTRY_BUG_PRODUCT_ID` → hardcoded default, so the ingest path is shared and the global
   route's behaviour is unchanged.

5. **The global route stays as a fallback.** `/api/webhooks/sentry` (env secret → default
   product, ADR-0027) is left intact. The change is purely additive: existing deployments keep
   working, and workspaces opt in to their own hook when they want isolation. Errol authorship,
   dedup, labels, and the Zulip announce are untouched.

## Considered alternatives

- **Keep the global hook, reverse-map by Sentry org/project slug** (the GitHub pattern).
  Rejected: Sentry payloads don't reliably carry a stable workspace key, and matching on
  org/project strings couples routing to Sentry's payload shape.
- **A `TicketSyncConfig`-style model for richer per-product routing.** Deferred: one destination
  product per workspace in `providerConfig` covers the need; the heavier model is the documented
  upgrade if multi-product routing is ever wanted.
- **Replace the global route outright.** Rejected for v1: additive-with-fallback avoids a
  breaking change to the current single-tenant Sentry setup.
- **Per-integration secret in `providerConfig`.** Rejected: secrets belong in
  `IntegrationCredential` (encrypted via `credentialHelper`), not in the plaintext JSON blob.

## Consequences

- Sentry now has first-class connect/disconnect UI in workspace settings (`SentrySettings`),
  showing a generated webhook URL and a one-time signing secret to paste into a Sentry internal
  integration.
- A dynamic-segment webhook route now exists; future per-tenant inbound webhooks can follow it
  instead of the reverse-lookup pattern when the payload lacks a tenant key.
- Two ingest paths coexist (global env fallback + per-workspace). `ingestSentryBug`'s `productId`
  precedence is the single point that reconciles them.
- No new env knobs and no migration; `webhookId` (previously unused) and `providerConfig` are now
  load-bearing for Sentry.
