# Self-host scheduler: an HTTP clock over vercel.json

## Status

Accepted — 2026-10-28. Reconciles with [ADR-0045](0045-unified-notification-dispatch.md),
which rejected a long-lived worker service for notifications. Self-hosting feature, scope V2
(ticket sage.haze).

## Context

The app's scheduled work is 17 cron routes under `src/app/api/cron/*`, listed with their
schedules in `vercel.json`. On Vercel, Vercel Cron calls them. Off Vercel nothing does: agent
runs stop advancing, notifications stop sending, calendars stop syncing, and nothing reports it.
A self-hosted install (Railway template, Docker Compose) needs something to play Vercel Cron's
part.

ADR-0045 chose Vercel Cron over "a long-lived worker service" for the notification pipeline,
because a worker added infra and a second deploy target for what Vercel Cron already did. A
self-host scheduler is, on its face, a long-lived worker, so the two need squaring.

## Decision

Self-host installs run `scripts/selfhost/scheduler.ts`, a small long-running process that is
only a clock:

1. **It reads `vercel.json`'s `crons` and nothing else.** That file stays the single source of
   the schedule; a parity test fails when a `src/app/api/cron/<name>/route.ts` and the `crons`
   list disagree. Self-host-only keys are never added to `vercel.json`.
2. **On each tick it calls the route over HTTP**, `GET ${SCHEDULER_TARGET_URL}${path}` with
   `Authorization: Bearer ${CRON_SECRET}` — the same request Vercel Cron makes. Schedules run in
   UTC, as Vercel's do.
3. **It holds no business logic.** No notification, agent-run or sync code; it imports only Node
   builtins and `node-cron`, nothing from `src/`. The routes keep doing the work and the auth.
4. **It fails closed and stays up.** An invalid plan or a missing `CRON_SECRET` stops it at
   start (never a partial plan); a failed, non-2xx or timed-out call is logged and the next tick
   runs; a tick for a path whose last call is still in flight is skipped.
5. **exponential.im keeps Vercel Cron.** The scheduler is not deployed there.

This does not overturn ADR-0045. That decision was about where notification logic runs and how
it is triggered on our own deployment; both are unchanged. The pipeline's worker is still the
`process-notifications` cron route, and the scheduler is one more caller of it, standing in for
Vercel Cron where Vercel Cron does not exist.

## Considered alternatives

- **A self-host-only cron list.** Rejected: it would drift from `vercel.json`.
- **Railway cron services.** Rejected: Railway-only (Compose would still need a scheduler), one
  service per schedule or a minutely service that re-implements schedule matching, and a
  reported minimum interval around five minutes.
- **GitHub Actions `schedule`.** Rejected: five-minute minimum (agent runs need one minute), and
  it needs a public URL and the secret stored in GitHub.
- **In-process node-cron inside Next** (started from `instrumentation.ts`). Rejected: runs once
  per replica, ties the clock to the web process and needs Vercel gating. `PMScheduler` is the
  precedent: it never runs on Vercel.
- **pg_cron plus pg_net.** Rejected: neither ships in the pgvector image, and the schedule would
  be duplicated in SQL.

## Consequences

- Adding or changing a cron is still one `vercel.json` edit plus a route; self-host installs pick
  it up on the scheduler's next start.
- The scheduler's timeout (`SCHEDULER_TIMEOUT_MS`, default 300 s, the largest route
  `maxDuration`) is the only bound on a stuck call, because `next start` does not enforce
  `maxDuration`. The scheduler refuses to start with less than the 270 s Mastra call ceiling
  that agent-runs waits on.
- The scheduler image (V3) ships `vercel.json` and the two scheduler files, not the Next build.
