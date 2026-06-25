# Multi-pipeline per workspace + a `create_deal` Form destination (public job applications)

## Status

Accepted — 2026-06-25.

## Context

We want a **public job-application page**: a rich job description plus custom
fields, shareable on the open web, whose submissions land on a reviewable
**hiring board**. The generic Forms subsystem ([ADR-0029](0029-generic-forms-subsystem.md))
already gives us the public form, custom fields, and a `create_crm_contact`
destination; the CRM **Pipeline** already gives us a customizable-stage Kanban.
Two gaps block the hiring-board flow:

1. **One pipeline per workspace.** A Pipeline is a `Project` with
   `type: "pipeline"`. The schema has always supported many (stages/deals are
   per-`Project`), but `pipeline.get`/`pipeline.create`/the board UI assume
   exactly one — so a **Hiring** pipeline cannot coexist with a **Sales** one.
   This was explicitly deferred in CONTEXT.md.
2. **No `create_deal` Form destination.** Forms ship only `create_crm_contact`;
   nothing drops a submission onto a pipeline as a `Deal`.

A separate decision — the job description's rich body — is *not* in this ADR: it
reuses the existing `Form.description` field rendered as canonical Markdown
([ADR-0017](0017-markdown-canonical-content-format.md)) via the shared
`<MarkdownInput/>`/`<MarkdownRenderer/>`, **not** the heavier Tiptap `PrdDocument`
(ADR-0024). That is reversible and follows existing rules, so it needs no ADR —
only the glossary note on **Form**.

## Decision

1. **Lift multi-pipeline.** A workspace may hold **N named pipelines**.
   `pipeline.create` takes a `name` and stops returning-the-existing-one;
   `pipeline.get`/list become pipeline-aware; the board gets a **pipeline
   switcher**. No schema migration — the per-`Project` model already supports it;
   the change is router + UI.
2. **Pipelines stay fully customizable and domain-ignorant.** A new pipeline
   seeds the generic `DEFAULT_STAGES`; the user renames/reorders them
   (e.g. `Applied → Screening → Interview → Offer → Hired/Rejected`) with the
   existing stage editor. **No hiring template or hiring semantics** baked into
   the pipeline or form core.
3. **New `create_deal` Form destination**, registered in the
   `FormDestinationRegistry` (no core change, per ADR-0029).
   Config: `{ pipelineId, stageId, contactFieldMap, dealTitleTemplate? }`. On
   submit it **does both**: (a) upsert the applicant as a `CrmContact` via the
   **shared `createCrmContact`** (`emailHash` dedup, stamps `customerType`, and —
   crucially — fires `dispatchContactTypeAutomations`), then (b) create a `Deal`
   linked to that contact in `(pipelineId, stageId)`. One destination, so
   destinations stay independent (a deal-only destination couldn't see a contact
   another destination just made).
4. **Idempotent on repeat submission.** The contact dedupes by `emailHash`
   (existing). For the deal: if an **open** `Deal` already exists for
   `(pipelineId, contactId)`, skip creating a second — mirrors ADR-0029's
   "repeats don't re-fire". The `FormSubmission` is still always stored.
5. **Email-on-apply is an Automation, never form code.** The form only stamps
   `customerType` (e.g. `Applicant`). If the workspace has authored an Automation
   triggered by `crm_contact_type = Applicant`, that sends the acknowledgment;
   otherwise nothing fires. The `Form → CRM → Automations` decoupling
   (ADR-0029) is preserved end-to-end — the form is email-ignorant.

## Considered alternatives

- **Rename the single workspace pipeline to hiring stages.** Rejected — collides
  with the existing Sales pipeline; you can't run both.
- **Separate "hiring" workspace** (its lone pipeline = the board). Rejected —
  cheap, but silos applicants from the main CRM and still needs `create_deal`.
- **v1 contact-tag only, no board.** Rejected for this build — the user
  explicitly wants a customizable hiring pipeline now, not a fast-follow.
- **`Deal`-as-candidate is an overload** (`value`/`probability`/`currency` are
  sales fields, left null for candidates). Accepted in the spirit of the existing
  `profileType` overload; a dedicated candidate entity is deferred.
- **Two composed destinations (`create_crm_contact` + `create_deal`).** Rejected —
  destinations run independently and can't share the freshly-created `contactId`;
  folding the upsert into `create_deal` is cleaner.

## Consequences

- **Multi-pipeline ripples** through every pipeline consumer. Audit
  `pipeline.get`, `pipeline.create`, the board page, and any analytics that
  assume a single `type: "pipeline"` Project per workspace before shipping.
- **Execution stays synchronous** inline in the intake request
  ([ADR-0030](0030-form-automation-execution-sync-then-qstash.md)) — `create_deal`
  awaits the contact upsert + automation dispatch like `create_crm_contact` does.
- **Form admin needs a pipeline+stage picker** in the `create_deal` destination
  config, which depends on multi-pipeline existing (the two ship together).
- **PII posture** is unchanged from ADR-0029 (`FormSubmission.data` plaintext;
  `CrmContact.email` encrypted).
