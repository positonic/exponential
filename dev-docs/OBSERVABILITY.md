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
`MATRIX_BOT_ACCESS_TOKEN`, and `MATRIX_SENTRY_ROOM_ID` set (see
`.env.example`); the room must be unencrypted and the bot joined. Recurring
errors that dedup onto an existing ticket do not re-notify.

## Other signals

- **Vercel function logs** — tRPC internal errors are also `console.error`ed
  in production for correlation.
- **DB-backed job history** — ticket sync (`TicketSyncRun`,
  `TicketSyncPushJob`), webhook deliveries (`WebhookLog`), AI calls
  (`AiInteractionHistory`) record their own run/error state in Postgres with
  admin UIs; Sentry complements rather than replaces these.
