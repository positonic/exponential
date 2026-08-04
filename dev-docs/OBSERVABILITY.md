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
errors that dedup onto an existing ticket do not re-notify.

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

## Other signals

- **Vercel function logs** — tRPC internal errors are also `console.error`ed
  in production for correlation.
- **DB-backed job history** — ticket sync (`TicketSyncRun`,
  `TicketSyncPushJob`), webhook deliveries (`WebhookLog`), AI calls
  (`AiInteractionHistory`) record their own run/error state in Postgres with
  admin UIs; Sentry complements rather than replaces these.
