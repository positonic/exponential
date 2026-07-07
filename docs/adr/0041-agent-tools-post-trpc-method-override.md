# Agent tools always POST; tRPC accepts the method override

## Status

Accepted — 2026-07-07

## Context

Mastra agent tools call exponential's tRPC API over plain HTTP via `authenticatedTrpcCall` (`../mastra/src/mastra/utils/authenticated-fetch.ts`), which hardcodes `POST`. tRPC serves `.query()` procedures over GET only, so a POST to a query returns **405 `METHOD_NOT_SUPPORTED`** — the "405" class already named in the **Thread score** / **Failure lane** glossary entries.

This mismatch shipped repeatedly because the repo boundary hides it: tool authors in `../mastra` get no type error for calling a query with the wrong verb. Three tools were silently broken at 100% failure rate — `get-todays-actions` (specced in [ADR-0034](0034-todays-actions-shared-partition.md), which itself prescribed `authenticatedTrpcCall` against a `.query()` without catching the verb), `get-user-workspaces`, and `query-meeting-context`. Worse, the workaround became an implicit convention: the mastra router grew to **68 mutations vs 11 queries** because agent-facing *reads* were declared as `.mutation()` so POST would work — dishonest semantics adopted to dodge the transport rule.

## Decision

Enable `allowMethodOverride: true` on the tRPC fetch handler (`src/app/api/trpc/[trpc]/route.ts`, supported since tRPC v11). The convention this records:

- **Agent tools always POST.** `authenticatedTrpcCall` stays the single mastra-side entry point; tool authors never need to know a procedure's verb.
- **Exponential procedures declare honest semantics.** Reads are `.query()`, writes are `.mutation()` — including agent-facing endpoints. No new read-mutations.
- **Existing read-mutations migrate opportunistically.** The ~40 reads currently declared as mutations in the mastra router are not batch-migrated; convert them to `.query()` when touched.

## Considered alternatives

- **Client-side GET wrapper** (extend `authenticatedTrpcQuery` to serialize `?input=`). Rejected — it requires every tool author to forever know which exponential procedures are queries vs mutations, across a repo boundary where types don't reach. That knowledge gap is exactly what produced the bug three times.
- **Wrap reads as `mastra.*` mutations** (the status-quo workaround, applied to the three broken tools). Rejected — doubles endpoints, entrenches dishonest verb semantics, and would have forked `action.getTodaysActions` against ADR-0034's one-source-of-truth intent.
- **Per-tool fixes with no convention.** Rejected — fixes the instances, guarantees a fourth.

## Consequences

- The three broken tools start working with **zero mastra changes**; no mastra deploy is needed.
- The public `/api/trpc` endpoint accepts POST for queries. CSRF posture is unchanged (CSRF risk attaches to writes, and mutations keep their semantics); auth is untouched (`createTRPCContext` already accepts both session cookies and agent Bearer JWTs).
- Web-app clients are unaffected — tRPC's own client still sends GET for queries, so React Query caching behavior does not change.
- A future reader seeing `allowMethodOverride: true` on a public handler should find this ADR, not "fix" it back to strict verbs.
