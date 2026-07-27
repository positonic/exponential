# CRM Automations are built on the existing Workflow engine

## Status

Accepted — 2026-06-18.

## Context

We want Attio-style CRM **Automations**: when something happens to a Contact, run
a sequence of steps (e.g. a new **Channel Partner** gets a welcome email and an
**Agreement** to sign). The codebase already has a production automation engine —
`WorkflowEngine` + `StepRegistry` + `WorkflowDefinition → WorkflowStep →
WorkflowPipelineRun → WorkflowStepRun` (`src/server/services/workflows/`) — used
today for content-generation and PM standups. It has a pluggable `IStepExecutor`
registry, per-step config JSON, run history with per-step I/O audit, a
`triggerType` field (`manual | scheduled | webhook`), and `execute(definitionId,
triggeredById?, initialInput?)` already accepts an initial payload.

## Decision

CRM Automations **reuse that engine** rather than introducing a parallel
CRM-automation model. The only genuinely new infrastructure is:

1. An **Automation trigger** dispatcher — hooked into `crmContact.create`/`update`,
   fires when a Contact's `profileType` becomes a target **Customer type**, finds
   matching active `WorkflowDefinition`s, and calls `WorkflowEngine.execute(def.id,
   undefined, { contactId, … })`. Idempotent per (automation, contact); suppressed
   during Gmail/Calendar bulk imports.
2. New **CRM step types** (`IStepExecutor`s): `send_email`, `generate_document`,
   `send_for_signature`.

The user-facing word is **Automation** (never "Workflow" or "Pipeline", both of
which already mean other things here — see CONTEXT.md). The internal tables keep
their `Workflow*` names. PoC automations are **seeded in code**; the drag-and-drop
builder reads/writes the same `WorkflowDefinition/Step` tables and is deferred.

## Considered alternatives

- **New dedicated CRM-automation system.** Rejected: re-implements the run model,
  executor loop, step registry, and the builder's data model that already exist,
  to gain only naming isolation and branching-from-day-one — mostly re-typing for
  a PoC.

## Consequences

- Run history, per-step audit, and failure capture come for free.
- The engine is **linear** — no branching (the Attio "Switch" node). The PoC
  doesn't need it; native branching is a later engine extension.
- The internal name `WorkflowPipelineRun` now backs three surfaces (content, PM,
  CRM) — the user-facing "Automation" label is what keeps them distinct.
