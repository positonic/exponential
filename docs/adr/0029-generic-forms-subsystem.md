# A generic Forms subsystem, decoupled from the CRM

## Status

Accepted — 2026-06-19.

## Context

We needed a public **job-application form** whose submission lands in the CRM as a
contact and fires the existing automation (welcome email). Rather than a
CRM-specific form, we built a **generic Forms subsystem** (a mini-Typeform) so
the form layer knows nothing about the CRM — "create a contact" is just one
configurable destination. This keeps Forms → CRM → Automations decoupled, each
reusing what's already built.

## Decision

1. **JSON field model.** `Form.fields` is a JSON array `[{ key, label, type,
   required, options? }]` (types `text|email|textarea|select|checkbox|url`) — no
   per-field table. Validated at submit by the **pure `validateSubmission`**
   (unit-tested).
2. **Destination registry.** `Form.destinations` is a JSON array `[{ type,
   config }]` run by a **`FormDestinationRegistry`** — a deliberate mirror of the
   automation `StepRegistry`. v1 ships one handler, `create_crm_contact
   { customerType, fieldMap }`, which maps fields → a contact, stamps the
   Customer type, and (via the shared `createCrmContact`, which dedupes by
   `emailHash`) fires `dispatchContactTypeAutomations`. New destinations register
   with no core change.
3. **Public, unauthenticated intake.** A Next API route `POST
   /api/forms/[slug]/submit` (not a tRPC `publicProcedure`) — an explicit public
   boundary matching the existing webhook routes. Validate → store a
   `FormSubmission` (always, even on repeat/honeypot) → run destinations.
4. **Anti-abuse.** Hidden honeypot field + per-IP/per-email **in-memory** rate
   limiting (the `extension-token` pattern). Matters more than a normal form
   because a submission sends a real email.
5. **Idempotency via `emailHash`.** The shared `createCrmContact` dedupes on the
   globally-unique `emailHash`, so a repeat submission from an existing contact
   does **not** re-create or re-fire — "new applicants email, repeats don't".
6. **Public renderer** at `/f/[slug]` in a new `(public)` route group (no auth),
   with a confirmation state.
7. **Authoring**: a minimal in-app admin under CRM (`/crm/forms`) — a field-list
   editor (no drag-drop) + destination config.

## Considered alternatives

- **CRM-coupled `CrmForm`** with a hardcoded contact hook. Rejected — contradicts
  the generic goal; every new destination would be a schema change.
- **Relational `FormField` table.** Rejected — heavier; JSON matches how the
  codebase already stores config (`WorkflowStep.config`).
- **tRPC `publicProcedure` for intake.** Rejected — a muddier public boundary;
  honeypot/rate-limit are cleaner in an API route.
- **Refactor `crmContact.create` to share the new service.** Rejected for v1:
  routing it through the deduping/`emailHash`-setting service would change
  manual-create semantics (duplicate-email entries would start throwing on the
  `@unique` constraint, and collide with imported contacts). Left untouched; the
  new `createCrmContact` is intake-only.

## Consequences

- **PII posture differs**: `FormSubmission.data` stores plaintext (admin reads
  submissions) while `CrmContact.email` stays encrypted; only `emailHash` is kept
  in submission metadata. Accepted, documented.
- **Edge case**: a form submission whose email matches a *manually*-created
  contact (which has no `emailHash`) won't dedupe → a duplicate contact. Imports
  and form contacts do have `emailHash`. Accepted for v1.
- **Globally-unique slug**: the public `/f/[slug]` URL carries no workspace, so
  `Form.slug` is globally unique (not `@@unique([workspaceId, slug])`) and
  `uniqueFormSlug` dedupes across all workspaces — otherwise two workspaces could
  share a slug and a public submission would route to the wrong tenant.
- **Cross-workspace email**: `CrmContact.emailHash` is globally unique by
  existing design. If a submission's email already belongs to a contact in
  *another* workspace, `createCrmContact` refuses (it neither links the foreign
  contact nor creates a colliding one) and the destination is recorded as failed
  — matching how `transcription` handles the same boundary. The submission is
  still stored; only the CRM destination no-ops.
- **`create_crm_contact` requires a mapped Email field** (validated on save, and
  enforced again at submit): the email is the dedup key, so without it every
  submission would create a fresh, never-deduped contact and fire an automation
  with no recipient.
- `company` is stored as a contact tag in v1 (no auto-`CrmOrganization`).
- **Deferred**: drag-drop form builder, file/résumé upload (S3 exists; a `url`
  field stands in), multiple destination types, slug rename.