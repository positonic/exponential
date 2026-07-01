# ADR-0036: CRM contact enrichment — provenance, permissions, and manual triggers

Status: Accepted

## Context

CRM contact enrichment (ADR-less, shipped in #323/#325) web-searches a contact and
fills missing fields (email, socials, bio, org). It runs two ways: automatically on
create (gated by the workspace `enableAutoEnrichContacts` flag) and explicitly via
`crmApi.contactEnrich` (force-enqueue). A PENDING `CrmContactEnrichment` row is drained
every ~10 min by the `enrich-pending-contacts` cron, which hands the contact to Mastra's
`enrichmentAgent`; the agent web-searches and writes results back through the CRM tools.

Adding a **UI "Enrich" button** surfaced decisions that were implicit before and are
hard to reverse once data is written, so they are recorded here.

## Decisions

1. **Manual trigger is editor-gated.** `crmContact.enrichNow` (the session-router
   procedure behind the button) requires workspace role `owner | admin | member`.
   Viewers and project-only "guests" are refused. Rationale: each run costs a paid web
   search + an LLM call; `assertWorkspaceMember`/membership checks alone do not
   distinguish read-only roles (see CONTEXT.md), so cost-bearing actions must gate on
   role explicitly. The API-key path (`crmApi.contactEnrich`) already requires workspace
   access; the UI path adds the role check.

2. **The button is honest about latency.** Enrichment is cron-drained (up to ~10 min),
   not synchronous. The UI returns the job id, polls job status
   (PENDING → RUNNING → COMPLETED/FAILED), disables the button while a job is in flight,
   and refetches the contact on completion. We rejected a synchronous in-request agent
   call (serverless timeout risk, blocks the request on a slow external agent).

3. **Single-contact only for v1.** Drawer button + one contacts-list row action. No
   bulk/multi-select enrichment — bulk invites unbounded paid work and needs its own
   cap/confirm design (deferred).

4. **Enriched fields carry provenance.** A new `CrmContact.aiSourcedFields String[]`
   lists the field keys whose current value came from enrichment (not a human). The UI
   badges those fields "AI — verify" because the agent can confidently pick the wrong
   same-named person (e.g. a namesake's LinkedIn). Writing AI guesses indistinguishably
   from human input would silently launder them into the CRM as fact.

5. **Human input is ground truth; provenance clears on edit.** When a human sets a field
   through any update path (`crmContact.update`, `crmApi.contactUpdate`), that field key
   is removed from `aiSourcedFields` — it is now human-verified.

6. **Re-enrich refreshes unverified-AI, locks human.** A re-run may overwrite a field
   that is still AI-sourced (so a bad guess can self-correct), but must never touch a
   human-entered/verified field. Strict fill-empty was rejected (AI mistakes become
   permanent); always-overwrite was rejected (churn + cost).

7. **Provenance is derived server-side, with no Mastra change.** The enrichment runner
   (`runPendingEnrichments`) snapshots which fields are empty/human-locked *before*
   calling the agent, and after the agent writes back, marks the newly-filled fields as
   AI-sourced by diffing. The agent is told in the prompt which fields are human-locked
   (do not touch) vs fair game. This keeps all provenance and policy logic in exponential
   (one repo, one migration) rather than teaching the agent to carry provenance.

   Known limitation: the lock is **advisory** at the agent boundary — enforcement relies
   on the prompt plus the fact that the runner only *marks* newly-filled fields. A
   hard server-side revert of any agent write to a locked field is deferred; in practice
   the agent respects "do not overwrite" instructions (it leaves `about` and existing
   values alone).

## Consequences

- One additive migration: `aiSourcedFields String[] @default([])` on `CrmContact`.
- The provenance diff runs inside the existing cron path; no new async surface.
- The button reuses the already-merged `enqueueContactEnrichment(..., { force: true })`
  core; `enrichNow` is a thin, role-gated wrapper.
- Bulk enrichment and hard lock-enforcement are explicit future work, not silent gaps.
