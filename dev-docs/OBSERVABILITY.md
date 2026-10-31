# Observability

How this app reports its own errors. (For the *inbound* Sentry→bug-ticket
webhook, see ADR-0027 / ADR-0048 — that's a separate concern.)

## Sentry

`@sentry/nextjs` is initialized on **Vercel production and preview** deploys
only; local dev never reports. Config lives in:

- `sentry.server.config.ts` / `sentry.edge.config.ts` — server/edge runtime init
- `src/instrumentation.ts` — loads the configs, exports `onRequestError`
  (captures route-handler and RSC errors)
- `src/instrumentation-client.ts` — browser init
- `next.config.js` — `withSentryConfig` (source-map upload, `/monitoring`
  tunnel route, Vercel cron monitors)

Errors are always captured; `tracesSampleRate` only samples performance
traces (10% in production, 100% in preview).

### What gets captured

| Surface | Mechanism |
|---|---|
| tRPC procedure errors | `onError` in `src/app/api/trpc/[trpc]/route.ts` — only `INTERNAL_SERVER_ERROR` (unexpected exceptions); expected client errors (UNAUTHORIZED, Zod failures…) are not reported |
| Route handlers / RSC | `onRequestError` in `src/instrumentation.ts` |
| Client render crashes (page level) | `error.tsx` in each route group → `SegmentErrorFallback` |
| Client render crashes (root layout level) | `src/app/global-error.tsx` |
| Component-level boundaries | `src/app/_components/ErrorBoundary.tsx` |
| Vercel crons | `automaticVercelMonitors` in `next.config.js` creates Sentry cron monitors from `vercel.json` |

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Runtime (public) | Required on Vercel production; without it Sentry is disabled |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Vercel build env only | Source-map upload. Missing ⇒ build still succeeds, stack traces stay minified |

The browser SDK posts events through the `/monitoring` tunnel route (rewritten
to Sentry by `withSentryConfig`) so ad blockers can't drop them. That path is
excluded from the auth middleware matcher in `src/middleware.ts`.

### Verifying a change to this setup

Deploy a preview and trigger any error (previews report with
`environment: preview`, so production alerting is unaffected). Check the
Sentry issue has a readable (non-minified) stack trace — if not, source-map
upload is broken.

## Alerting

New Sentry issues flow through the inbound webhook
(`/api/webhooks/sentry`) → bug Ticket (authored by Errol) → best-effort
announcements to **Zulip** (`sentryZulip.ts`) and **Matrix**
(`sentryMatrix.ts`). The Matrix leg needs `MATRIX_HOMESERVER_URL`,
`MATRIX_ACCESS_TOKEN`, and `MATRIX_SENTRY_ROOM_ID` set (see
`.env.example`); the room must be unencrypted and the bot joined. Recurring
errors that dedup onto an existing ticket do not re-notify, with one
exception below.

### Handled app errors and agent failures

Failures the app catches and smooths over (the chat's "Something went
wrong") never reach Sentry, so `reportHandledErrorServer` files them through
the same ingest as **"New app error"** tickets (gated on `CLIENT_ERROR_BUGS`).
Agent-stream failures carry `mastraRunId`, `occurredAt` and a ready-to-run
`mastraLogs` Railway command in the ticket body, so tracing one is a paste,
not a log hunt.

- **Repeat alerts.** A billing or auth provider failure (out of credit,
  revoked key) fails every turn for everyone until someone acts, so it
  re-announces as **"Still happening"** at most hourly while it recurs
  (`renotifyAfterMs`; the clock is `links.lastNotifiedAt` on the ticket).
  Everything else stays creation-only.
- **Daily agent-health digest.** `/api/cron/agent-health-digest` (07:00 UTC)
  reads the last 24h of `AiInteractionHistory` and posts failed turns and the
  most frequent failing tools to the Matrix room. It catches what tickets
  miss: a tool that errors on every call while the agent narrates around it.
  A clean day posts nothing.

### GlitchTip senders

The same endpoints accept GlitchTip's **generic (Slack-compatible) webhook**,
which other services in this org use. Two differences from Sentry, both
handled automatically:

- **No `Sentry-Hook-Resource` header.** Its absence is what selects the
  GlitchTip parser (`normalizeGlitchtipPayload`), which reads the flat
  `{alias, issue_id, project, attachments[0].title/title_link}` shape instead
  of Sentry's nested `data.issue`. Only `issue.new` / `issue.regression` file
  a ticket; resolutions are ignored. If `issue_id` is missing the id is
  recovered from the issue URL.
- **No HMAC.** GlitchTip cannot sign the body, and its Alert Rule UI accepts
  only a URL — no custom headers — so the shared secret may travel as a
  `?token=` query param. On the per-workspace route the token is the
  integration's own secret. Prefer the `X-Webhook-Token` header where the
  sender supports it: query strings are more likely to be captured in proxy
  and access logs.

Security boundary: presenting a `Sentry-Hook-Signature` commits the sender to
HMAC. An invalid signature is always a 401 — a valid token never rescues it.

### Telling services apart in one product

A workspace has exactly one Sentry integration, pointing at one destination
Product — so several codebases reporting into it would otherwise be
indistinguishable. Each ticket therefore also gets a **source label** naming
the service it came from:

```
…/api/webhooks/sentry/<webhookId>?token=<secret>&service=clear-pipeline
```

`?product=` is accepted as an alias, but note it does **not** choose the
destination Product (that is fixed per integration) — it only labels. When
neither is given the label falls back to the project slug in the payload, so
Sentry's own projects (`exponential-frontend`, `mastra-agents`) self-label
without any configuration. The value is reduced to a bounded `[a-z0-9-]` slug
before use.

Tickets are labelled `Sentry` + `bug`, and additionally `ai-fixable` when the
issue's Sentry project is listed in `SENTRY_AI_FIXABLE_PROJECTS` — the
allowlist exists because the webhook is org-wide and a bug from another
service's project lives in another repo, where the AI bug fixer (which checks
out *this* repo) could not fix it.

**The label alone does not start an AI run.** `.github/workflows/ai-bug-fixer.yml`
selects on `--status READY_TO_PLAN --label ai-fixable`, and Sentry files
tickets as `BACKLOG`. A human moving the ticket to `READY_TO_PLAN` is what
arms it — deliberate, since a raw stack trace is rarely a sufficient spec.

## Product analytics (PostHog)

Usage events, as opposed to errors, go to PostHog. They are captured **once, server-side**,
by the analytics middleware on `protectedProcedure` (`src/server/api/trpc.ts`), so every
client surface is covered without its own SDK. Decision:
[ADR-0076](../docs/adr/0076-posthog-server-side-analytics.md).

- **Event name** = procedure path (`action.create`). **Distinct id** = user id.
- **Properties**: `procedure`, `type`, `surface`, `ok`, `error_code`, `duration_ms`. The
  `surface` comes from the request's `tokenType` (`api`, `external-agent`, `assistant`,
  `whatsapp`, `telegram`, `matrix`, `voice`, `browser-extension`, `native-app`) or, for
  cookie sessions, `web` / `rsc` / `electron`. Person properties `first_seen_surface` and
  `last_seen_surface` are set alongside.
- **What is captured**: every mutation; queries only from non-browser surfaces. Inputs and
  IPs never.
- **Delivery**: events queue in memory and are flushed via `after()` in
  `src/app/api/trpc/[trpc]/route.ts`, after the response but before Vercel freezes the
  function.

### Browser: page views and session replay

`posthog-js` is initialised in `src/instrumentation-client.ts` from
`src/lib/analytics/posthogBrowser.ts`, and `PostHogIdentify` in the signed-in layout ties the
browser to the same user id as the server events. Signing out resets the identity.

- **Captured**: `$pageview` on every URL change (App Router included), `$pageleave`, and
  session replay when it is enabled in the PostHog project settings.
- **Not captured**: autocapture clicks (element text would leak content) and exceptions
  (Sentry owns those). Anonymous visitors get no person profile.
- **Replays mask all text and inputs.** Structure, navigation and clicks stay visible; what
  people wrote does not. Relaxing this is a privacy decision, not a config tweak.
- **Transport**: same-origin `/ingest/*`, rewritten to PostHog's EU hosts in
  `next.config.js`, so ad blockers and the CSP leave it alone. `/ingest` is excluded from
  the auth middleware like `/monitoring`.
- **Trailing slashes**: PostHog's endpoints need them, so `skipTrailingSlashRedirect` is on
  and the middleware restores the `/foo/` → `/foo` redirect for pages
  (`src/lib/trailingSlash.ts`). That redirect is load-bearing for auth: `/features/` is a
  public prefix but would otherwise render the gated `/features` page.

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel production (preview optional) | Project API key. Enables browser and server analytics. Unset = disabled. |
| `POSTHOG_KEY` | Optional | Server-side override of the key. |
| `POSTHOG_HOST` | Optional | Server-side host, defaults to `https://eu.i.posthog.com`. The browser proxy is EU-only. |

To see real events locally, put a project key in `.env.local` as `NEXT_PUBLIC_POSTHOG_KEY`,
run the dev server, browse and perform a mutation, then watch PostHog's Activity tab.

## Other signals

- **Vercel function logs** — tRPC internal errors are also `console.error`ed
  in production for correlation.
- **DB-backed job history** — ticket sync (`TicketSyncRun`,
  `TicketSyncPushJob`), webhook deliveries (`WebhookLog`), AI calls
  (`AiInteractionHistory`) record their own run/error state in Postgres with
  admin UIs; Sentry complements rather than replaces these.
