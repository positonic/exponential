# Form/automation execution is synchronous now; async via QStash/Inngest later, not BullMQ

## Status

Accepted — 2026-06-19.

## Context

A form intake runs its destinations — including `create_crm_contact`, which fires
the CRM automation engine (`WorkflowEngine`), which sends emails. The same is true
of the in-app contact-create dispatch. The "proper" end-state is event-driven:
emit an event, return immediately, a worker runs the work with retries. The
question is what that worker should be on **this** stack.

This app deploys on **Vercel (serverless)** — there is no always-on process.
**BullMQ** needs Redis *and* a persistent worker, so it's the worst fit here
(you'd have to host a worker elsewhere, e.g. the Railway gateway). Serverless-
native options (QStash, Inngest) provide durable queues/retries with no worker to
run. At current volume (a welcome email per submission) the work is small and the
run is already recorded in `WorkflowPipelineRun`.

## Decision

For v1, **destinations and the automation dispatch run synchronously inline** in
the intake request (awaited; failures are caught and recorded, never 500 the
intake). No queue. The single enqueue seam is `dispatchContactTypeAutomations`
(and `runFormDestinations`), so going async later is a localized change — swap
"await execute" for "enqueue", and the worker calls the same engine.

When we do go async (triggers: slow/external destinations like Adobe Sign,
retries needed, or fan-out), use **QStash or Inngest — explicitly NOT BullMQ** on
this Vercel deployment.

## Considered alternatives

- **BullMQ + Redis + worker.** Rejected for this stack — most infra, worst
  serverless fit; only sensible if we already run persistent workers.
- **`after()` (Next 15).** Unblocks the response but isn't durable (dies with the
  function) — not a queue.
- **DB job table + Vercel Cron drain.** Viable, no new infra, but ~1-min latency
  and we'd reinvent retries/visibility.

## Consequences

- The public submit response waits on the email send (acceptable at this volume).
- The **in-memory per-IP/per-email rate limit** in the intake is a known stopgap
  (per-serverless-instance, not shared) — replace with Upstash/Redis when async
  lands.
- No new infrastructure or dependency added in v1.