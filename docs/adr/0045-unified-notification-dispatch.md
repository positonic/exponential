# Unified notification dispatch: durable record + category×channel matrix + cron worker

Notifications had grown three disjoint delivery paths — event/direct (`sendAssignmentNotifications` / `sendMentionNotifications`, hardcoded push+email, fired synchronously from routers), the `NotificationScheduler` `setInterval` singleton (summaries), and the `NotificationServiceFactory.sendToAll` per-user fan-out (meeting-ready) — with no shared preference model and no shared channel resolution. We are replacing all three with **one pipeline**: an event is emitted → a durable **Notification** record is written per recipient → each recipient's enabled channels are resolved from a **category × channel matrix** → delivered best-effort synchronously, with a **Vercel Cron** worker retrying failures and firing scheduled notifications.

Chosen because piecemeal Matrix bolt-ons would multiply the fragmentation (every new event × channel a bespoke wiring), whereas a unified layer makes "what notifies me, and where" one coherent, configurable surface and gives every future channel every event for free.

## Key decisions

- **Durable record for every notification** — generalizes the existing `ScheduledNotification` table to all notifications (not just scheduled). Emit does a synchronous best-effort send (assignment pings stay instant) *and* leaves the row for the worker to retry. Unlocks retry, dedup, audit, and a later in-app inbox.
- **Category × channel matrix preference**, seeded with defaults, presented channel-first. v1 categories: Assignment, Mention, Due-date reminder, Summary/digest, Meeting-ready. Always-on channels (Push, Email) seeded per prior behavior; opt-in channels (Matrix, WhatsApp, Zulip) default off per category.
- **Vercel Cron worker** (`/api/cron/process-notifications`), not the `setInterval` scheduler. The scheduler was already dead (nothing imported `notifications/init`, and `setInterval` doesn't run on serverless), so scheduled summaries never actually fired — this fixes that as a side effect. Matches the six existing cron routes.
- **Incremental migration** — build the core, then move one category at a time onto it (Assignment first), retiring each old path as its category lands.

## Considered options

- **Piecemeal** (route each event to Matrix against its existing path) — rejected: keeps three code paths and an incoherent preference model; every new event×channel stays a bespoke hack.
- **Coarser preference model** (one channel per category, or per-channel all-or-nothing) — rejected: can't express "assignments to Matrix, summaries to email, mentions to both," which is the real need and the whole reason to unify.
- **A long-lived worker service** (like the mastra gateway on Railway) — rejected: adds infra and a second deploy target for what Vercel Cron already does.
- **Big-bang cutover** — rejected: core cross-cutting system; per-category incremental de-risks it and yields a natural ticket sequence.

## Consequences

- Scoped **out** (tracked separately): the in-app notification inbox (own feature, deferred — the durable record sets it up), Status change / Comment categories (later matrix rows), and V3 Matrix **room capture** (a different, inbound, workspace-scoped subsystem on the Matrix gateway feature — ADR-0023 lineage, not this pipeline).
- Carried forward: quiet-hours; the per-workspace email override applies on top of the matrix; the V2 transcription→Matrix follow-up is subsumed as the Meeting-ready category.
