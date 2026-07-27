# CRM Automation builder is a linear, engine-constrained visual editor

## Status

Accepted — 2026-06-19. Un-defers the builder that [ADR-0025](0025-crm-automations-on-workflow-engine.md)
parked ("PoC automations seeded in code; drag-and-drop builder deferred").

## Context

CRM **Automations** were seeded in code with no UI to create or edit them. We now
want users to build their own — the Attio-"workflows" experience. The inspiration
(a node-graph canvas with a Trigger, agent steps, and a **Switch** branching into
two paths) implies branching, multiple trigger types, and AI-agent steps. But our
`WorkflowEngine` runs steps **linearly** — no branching — and the only trigger
dispatcher that exists is "contact's Customer type set". The repo already has
`@xyflow/react` (React Flow) + `@dagrejs/dagre`.

## Decision

Build a **linear, editable React Flow** builder that offers **only blocks the
engine can actually run** — nothing faked:

1. **Linear, no branching.** One mandatory, non-deletable **trigger node**
   (*"contact's Customer type set to [X]"*, X from the existing `profileType`
   list) → ordered **step nodes** from an engine-only palette (`send_email`,
   `generate_document`; `send_for_signature` once Adobe lands). No Switch.
2. **Location.** Overview `/crm/automations` keeps a search-select of existing
   Automations + a "Create new" button; editing is a full-screen
   `/crm/automations/[id]` route.
3. **Draft-by-default + explicit Save.** A new or edited Automation is `inactive`
   until explicitly activated; the canvas is a draft buffer persisted on explicit
   Save (which goes live for active Automations). Can't activate with no trigger
   target or zero steps. This is the safety guard against firing real emails
   mid-build, in production.
4. **Defaults vs user-created.** The two starters (Channel Partner / Advisor
   onboarding) carry an `isDefault` flag in `config`, are **seeded if absent**,
   and are **deactivate-only** (never hard-deleted) — so seed-if-absent can never
   resurrect a deleted default. User-created Automations are fully deletable and
   never resurrect (not in the seed spec). No schema migration.
5. **Multiple Automations may target the same Customer type**; each fires
   independently (idempotent per automation+contact).
6. **Fixed-behavior steps in v1** — compose/reorder only; no message-copy editing.

## Considered alternatives

- **Full branching canvas now** (Switch, multiple triggers, agent steps).
  Rejected for v1: needs engine branching, new trigger dispatchers, and new step
  types before anything is demoable.
- **Show the vision with disabled "coming soon" blocks.** Rejected: ships
  non-working blocks that mislead in a live demo.
- **Seed-once marker / templates-on-create** for the defaults. Rejected in favour
  of `isDefault` + deactivate-only: avoids both a migration and the
  delete-then-resurrect problem.

## Consequences

- The builder can only express linear flows; branching is a later engine + UI
  change.
- "Customer type" remains overloaded onto `profileType`, so a trigger can target
  any persona value (e.g. `Developer`) — accepted; inactive-by-default contains
  the footgun.
- A dedicated `customerType` column and editable step copy are the natural next
  steps, both deferred.
