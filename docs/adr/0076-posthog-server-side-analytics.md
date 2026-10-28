# Product analytics are captured server-side at the tRPC layer, in PostHog

## Status

Accepted — 2026-10-28.

## Context

The only usage signals were Vercel Web Analytics (web page views, no events), Sentry
(errors and traces) and the `/admin` stats page (row counts). None of them answer growth
questions: what a new user does in their first week, which features retain, where people
stall. And Exponential is not one client: the web app, desktop shells, native apps, a
browser extension, the CLI/SDK/MCP server, three chat gateways and external agents all
talk to it. Instrumenting each separately would mean many SDKs and drifting vocabularies.

## Decision

1. **PostHog** (MIT core, EU cloud, free tier) is the product-analytics store.
2. **One instrumentation point**: a middleware on `protectedProcedure`. Event name is the
   procedure path, distinct id is the user id, every event carries the calling `surface`
   derived from `tokenType` and headers (`src/server/analytics/posthog.ts`).
3. **Capture rule**: every mutation; queries only from surfaces without a page-view signal.
   Browser queries are React Query polling and would swamp volume without showing intent.
4. **No inputs, no IP, no geolocation.** CRM contact PII is encrypted at rest and must not
   leak to a third party.
5. **Flush inside `after()`** in the tRPC route handler, because Vercel freezes the function
   once the response is sent.

## Considered alternatives

- **Custom events on Vercel Analytics**: browser-only, no identity, no retention. Rejected.
- **Self-hosted PostHog**: ClickHouse, Kafka and Redis to run; revisit if residency or
  volume demands it. Only `POSTHOG_HOST` would change.
- **Umami / Plausible**: page views only. **OpenPanel**: lighter but no replay or flags.
- **Per-client SDKs**: rejected for drift and effort.

## Consequences

- Setting `POSTHOG_KEY` in Vercel turns it on; unset, every call is a no-op.
- Procedures called from React Server Components are captured but rely on the 10s timer to
  flush, so on Vercel they can be lost. Client traffic goes through the route handler.
- The Tauri shell uses the cookie session and reports as `web`.
- Browser page views and session replay need `posthog-js` in the layouts as a follow-up.
- Renaming a procedure renames its event; treat procedure paths as a stable vocabulary
  once dashboards depend on them.
