# Forms create product Insights (INBOX) — decoupled, provenance via `source`, no board generalization

## Status

Proposed — 2026-07-01. (Awaiting ratification; flip to Accepted once confirmed.)
Extends the generic Forms subsystem ([ADR-0029](0029-generic-forms-subsystem.md)) with a
third destination, alongside `create_crm_contact` and the `create_deal` of
[ADR-0033](0033-multi-pipeline-and-form-deal-destination.md). Written **after the
Problem→Insight fold** (PR #332): `Problem` is no longer a separate model — it is an
`Insight` with `type = PROBLEM` plus the triage fields (`impact`, `confidence`, `category`,
`evidence`, `parkedAt`, `parkReason`), and the unified surface is
`/products/[productSlug]/insights` (the old `/problems` route redirects there).

## Context

Forms today only feed the CRM (a submission becomes a `CrmContact`, or a `Deal` on a
pipeline). We want a public form to also feed a **Product's insights surface** — the unified
tab at `/w/[slug]/products/[productSlug]/insights` that renders `Insight` rows (types
`PAIN_POINT … COMPETITIVE`, plus `PROBLEM`; lifecycle `INBOX → TRIAGED → LINKED →
DISMISSED`). The team then wants to **filter that surface for insights that arrived via a
form**.

Three facts shape the decision:

- The Forms subsystem is **already decoupled from the CRM** (ADR-0029): the form layer is
  destination-ignorant; CRM is just the only *shipped* destination. A new destination is
  purely additive via the `FormDestinationRegistry` — no core change.
- `Insight` already carries a nullable **`source String?`** and `insight.create` already
  defaults `status` to `INBOX`. No schema work is needed to land a submission as an Insight.
- The CRM Pipeline board (`DealKanbanBoard`) is **tightly `Deal`-coupled** (~25% reusable).
  There is already a generic `ViewBoard` (KANBAN+LIST) and several bespoke kanban boards; a
  reusable triage board should be extracted only when a real second consumer forces it, not
  bent out of the Deal board.

## Decision

1. **New `create_insight` Form destination.** Registered in the `FormDestinationRegistry`
   (mirror of `create_crm_contact` / `create_deal`, no core change per ADR-0029). Config:
   `{ productId, insightType, fieldMap: { title, body? }, status? }`. On submit it creates
   one `Insight` in `(productId)` with `status = INBOX` (default), the configured `type`
   (default `FEEDBACK`), and mapped `title`/`body`. The **target `productId` must belong to
   the form's own workspace** — validated on save and re-checked at submit (a form is
   workspace-owned; an Insight is product-scoped).

2. **A form lands a raw Insight in `INBOX`, never a triaged one and never `type = PROBLEM`.**
   Since the fold, "Problem" is an *Insight state* (`type = PROBLEM` + triage fields), not a
   separate entity. A public, anonymous submission is *raw, untriaged evidence*, so it must
   arrive in `INBOX` with an evidence-flavoured type (default `FEEDBACK`) — never pre-triaged
   and never as a `PROBLEM`. Promotion (retype to `PROBLEM`, score impact/confidence, advance
   status) stays a **human triage** action on the insights surface. This preserves the
   "is it real?" gate that the pipeline-triage model ([ADR-0008](0008-pipeline-triage-model.md))
   exists to protect — now expressed through `type`/`status` rather than a model boundary.

3. **Provenance via `Insight.source`, no migration.** The destination stamps
   `source = "form:<slug>"`. Filtering "came from a form" is a `source` prefix convention
   (`startsWith("form:")`), exposed as an **`origin` filter** on `insight.list`
   (`form | manual | all`) and one filter control on the insights page. A typed
   `formSubmissionId` FK (mirroring `createdContactId`) is **deferred** until there is a real
   need to jump from an Insight back to its raw submission.

4. **Do not generalize the CRM Pipeline board.** The insights surface's need is *a filter,
   not a board*. Reusing the `Deal`-coupled `DealKanbanBoard` is the wrong substrate; if a
   shared triage board is ever extracted, the substrate is the generic **`ViewBoard`**. The
   insights page stays its own lean surface for now.

5. **"Different views" is out of scope beyond the origin filter.** The CRM pipeline has a
   *pipeline switcher*, not saved views; the saved-view machinery (`View` + `ViewSwitcher` +
   `ViewBoard`) today powers **Actions only**. A Table↔Kanban toggle for insights and
   `View`-model saved views are both additive later and neither is built here.

## Considered alternatives

- **Form creates a `PROBLEM`-typed / pre-triaged Insight.** Rejected — see decision 2
  (collapses the ADR-0008 gate; anonymous input must not self-promote past "is it real?").
- **Configurable entity/type per form beyond a default.** Rejected for v1 — extra config
  surface for a choice decision 2 says should default to an evidence type and never `PROBLEM`.
- **Generalize `DealKanbanBoard` to back insights.** Rejected — Deal-coupled and the wrong
  substrate; `ViewBoard` is the right one if the day comes.
- **Typed provenance (`Insight.formSubmissionId` FK + `FormSubmission.createdInsightId`).**
  Deferred — a migration for a backlink no surface needs yet; the `source` convention filters
  fine. (`FormSubmission.result` already records the per-destination outcome for audit.)
- **Group each form's submissions under a per-form `Research` record** (`Insight.researchId`,
  which already exists and is indexed). Attractive — a form *is* a research instrument and
  this gives typed grouping/filtering for free — but adds find-or-create-Research machinery.
  **Deferred** as the natural richer follow-up to the `source` convention.

## Consequences

- **Additive only.** One destination class + registration, one `origin` param on
  `insight.list`, one filter control. No schema migration.
- **Decoupling preserved end-to-end.** The form stays product-ignorant; `create_insight` is
  just another registry entry. Anti-abuse (honeypot + time-trap + durable rate-limit) and
  synchronous execution ([ADR-0030](0030-form-automation-execution-sync-then-qstash.md))
  apply unchanged.
- **PII posture** unchanged from ADR-0029 (`FormSubmission.data` plaintext; the Insight's
  fields are product-team content, not encrypted CRM PII).
- **Authoring-location tension, noted not resolved.** Forms are authored under `/crm/forms`,
  yet a `create_insight`-only form has nothing to do with the CRM. Moving authoring to a
  workspace-level surface is cosmetic and **out of scope**; flagged for a later call.
- **`source` is a string convention, not a constraint.** A hand-typed `source` starting with
  `form:` would match the origin filter. Accepted for v1; the typed-FK alternative is the
  escape hatch if it bites.

## Note on numbering

The `0036` slot is doubly occupied on `main` (`0036-crm-contact-enrichment-provenance-and-triggers`
and `0036-form-intake-spam-defense`), a pre-existing collision from divergent branches — this
ADR takes `0037` to avoid compounding it. The duplicate `0036` is separate debt to clean up.
