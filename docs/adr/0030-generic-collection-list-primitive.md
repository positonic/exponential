# A generic "List" (Collection) primitive, distinct from the sprint `List`

## Status

Accepted — 2026-06-20.

## Context

We want **Lists** as a generic, reusable concept — a list of CRM contacts now (the recipient set
for a **Broadcast**), a list of projects later. The schema already has a `List` model, but it is
the **PM sprint/cycle** container (`ListType SPRINT|BACKLOG|CUSTOM`, `cycleGoal`, `achievements`,
`SprintSnapshot`/`SprintMetrics`, retrospectives) — soaked in sprint semantics and central to
sprint analytics. `Audience` is also taken (a small global lookup catalog), and "segment" is on
the glossary Avoid list.

## Decision

Introduce a **new** generic membership primitive rather than widening the sprint `List`:

1. Internal model **`Collection`** + **`CollectionMember { collectionId, memberType, memberId }`**
   — polymorphic **by convention** (the same pattern `WorkspaceActivityEvent` uses with
   `entityType`+id), **homogeneous per collection** (a `memberType` discriminator on the parent).
   **User-facing word is "List."**
2. **"A list of projects later" needs no migration** — just a new `memberType` value + a
   resolver. That is the reason to prefer polymorphic-by-convention over per-type join tables.
3. **The CRM contributes** the `crm_contact` member-type resolver (id → `{ email, mergeVars }`)
   and the `send_email_to_list` step; the `Collection` core stays CRM-ignorant.
4. **Consent for email sends lives at the contact level**, not on the generic membership row: a
   contact-level suppression (`CrmContact.emailOptedOutAt`) + a mandatory one-click unsubscribe,
   checked by `send_email_to_list`. Lists are **curated** (static membership v1). Posture is
   **opt-out**, not hard opt-in (contacts are largely Gmail/Calendar-imported).

## Considered alternatives

- **Generalise the existing `List`.** Rejected: bolts mailing-list/contact semantics onto the
  sprint model and its analytics; conceptually wrong (a contact list with a `cycleGoal`).
- **Per-type join tables (`CollectionContact`, `CollectionProject`).** Rejected: a migration per
  new member type, defeating "generic, easy to extend."
- **Tag-reuse (`CrmContact.tags`).** Rejected as the primitive: no membership audit and nowhere
  clean for consent — though `tags`/`profileType` can later power **dynamic** membership.

## Consequences

- Two "list-ish" models coexist: the sprint `List` (legacy-named, really "Cycle") and the generic
  `Collection` ("List"). The label≠model indirection matches existing patterns (user-facing
  "Meeting" = `TranscriptionSession`, "Automation" = `WorkflowDefinition`).
- No DB-level cascade when a member entity is deleted (polymorphic-by-convention) — membership
  cleanup is app-level / periodic.
- The `send_email_to_list` fan-out step honours consent as a pre-filter and is internally
  resilient (per ADR-0029).
