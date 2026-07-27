# Automation is a first-class platform primitive; the CRM is one consumer

## Status

Accepted — 2026-06-20. Generalises [ADR-0025](0025-crm-automations-on-workflow-engine.md)
(which framed "Automation" as CRM-owned) and amends [ADR-0028](0028-crm-automation-builder-linear.md).

## Context

ADR-0025 built CRM Automations on the existing `WorkflowEngine` + `StepRegistry`, but scoped
the user-facing **Automation** concept to the CRM (trigger = "Contact's Customer type set",
steps = CRM onboarding). We now want Automations **outside** the CRM — the first need being a
**scheduled** product-changelog email (the "What Shipped Today" **Broadcast**) — and we intend
to offer **third-party paid extensions** later. The engine and the `WorkflowDefinition` data
model are already domain-neutral; what is CRM-coupled is the single hardcoded trigger dispatcher
(`dispatchContactTypeAutomations`) and the CRM-namespaced builder.

## Decision

**Automation** is a platform-level concept built on the shared `Workflow*` engine; the **CRM is
one consumer, not the owner.**

1. **Triggers become a registry** (`TriggerRegistry`) alongside the existing `StepRegistry` —
   the two in-process extension points. The CRM's `crm_contact_type` trigger and its
   `send_email`/`generate_document` steps are **registered by the CRM module**, not baked into
   core.
2. **A core, domain-neutral `scheduled` trigger.** The `triggerType` enum already anticipated it
   and `WorkflowDefinition.cronSchedule` already existed but was unused. v1 uses a simple
   **cadence** (daily/weekly + hour), swept by a single Vercel cron
   (`/api/cron/run-scheduled-automations`, `CRON_SECRET`) — **not** full cron-expression parsing.
   Idempotent per `(definitionId, period)` via `lastRunAt` + a unique guard.
3. **In-process registries only.** Written so a future third-party **paid** plugin system is a
   smaller step, but dynamic/external plugin loading is **explicitly not built now** (YAGNI).
4. **Builder relocation is a fast-follow.** The builder stays at `/crm/automations` for v1;
   moving it to a neutral `/automations` home is deferred, not a blocker.

## Considered alternatives

- **Keep Automation CRM-owned; build the changelog email as a standalone cron.** Rejected:
  re-implements scheduling, run history, and per-step audit the engine already provides, and
  forecloses the platform / 3rd-party direction.
- **Build the dynamic plugin system now.** Rejected: unnecessary for the first non-CRM consumer;
  the registry pattern gets the decoupling without the cost, and dynamic loading can be layered
  on later without rework.

## Consequences

- The user-facing word **"Automation" is no longer CRM-specific**; the CONTEXT.md entry
  generalises (consumers: CRM, content-generation, Broadcasts).
- The first non-CRM consumer is a **Broadcast** (scheduled Automation → render → send to a
  **List**); the List primitive is [ADR-0030](0030-generic-collection-list-primitive.md).
- The engine's **all-or-nothing-per-step** rule (ADR-0025) is unchanged; **fan-out steps must be
  internally resilient** (collect-and-continue per recipient, throw only on whole-batch failure).
