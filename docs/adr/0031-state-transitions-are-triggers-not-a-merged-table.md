# State transitions are first-class triggers; grouping primitives compose via events, not a merged table

## Status

Accepted — 2026-06-24. Extends [ADR-0029](0029-automation-platform-primitive.md) (Automation as a
platform primitive) and sits alongside [ADR-0008](0008-pipeline-triage-model.md) (no dynamic-table
engine) and [ADR-0030](0030-generic-collection-list-primitive.md) (the generic List/`Collection`).

## Context

The CRM grew three things that *rhyme* but were built as unrelated subsystems:

- **List** (`Collection` + `CollectionMember`, ADR-0030) — a flat, curated membership **set**.
- **Pipeline** (`Project type:"pipeline"` + `PipelineStage` + `Deal`) — a Kanban; cards move through
  ordered stages. A **manual state machine**, no actions on transition.
- **Automation** (`WorkflowDefinition`/`WorkflowStep` on the shared `Workflow*` engine, ADR-0029) —
  a linear *trigger → steps* recipe. Today it fires only on a **field** change
  (`crm_contact_type` → `CrmContact.profileType`), never on a board movement.

The temptation is to merge them into one "Collection-with-stages-and-automations" super-primitive.
That is the wrong unification, for reasons this repo has already settled twice:

1. **A Pipeline card is a `Deal`, not a contact-in-a-stage.** A `Deal` is its own typed business
   object (value, probability, close date), references a contact, and can exist with no contact or
   several per contact. A List member *is* the contact. Different levels.
2. **Membership and stage are different shapes.** List membership is **many-to-many and stateless**
   (a contact sits in many Lists at once); a Pipeline stage is **one-per-board and stateful** (a
   `Deal` is in exactly one stage, with transition history). Collapsing them loses that.
3. **Merging record types means `CollectionMember{memberId}` + typed sidecars** — the EAV /
   dynamic-table engine [ADR-0008](0008-pipeline-triage-model.md) explicitly rejected ("untyped
   property bags can't hold real FKs… fights the repo's `no-any`/typed-tRPC rules"), and the
   per-type split [ADR-0030](0030-generic-collection-list-primitive.md) deliberately avoided.

The actual missing piece is small: **moving a `Deal` between stages fires nothing.** The Attio/HubSpot
model — "the board *is* the pipeline, and entering a stage runs the automation" — has both halves
already built here and simply unconnected.

## Decision

**Unify at the event layer, not the data layer.** Keep three orthogonal concerns separate and
integrate them by **composition (events)**, not by a shared table.

1. **Records stay typed and separate.** `CrmContact`, `Deal`, `Project`. No mega-table. (Settled by
   ADR-0008.)
2. **Grouping stays two distinct primitives.**
   - **Set membership** = `Collection`/List — unordered, many-to-many, stateless, polymorphic-by
     -convention. Stays pure; **do not bolt stages onto `Collection`.**
   - **Board / Stage** = the staged Kanban. The one real refactor: **extract `PipelineStage` off
     `Project`** into a generic staged-board primitive so a board can sit over any record type, not
     only `Deal`s.
3. **Behaviour is the spine — finish ADR-0029's arc.** Every meaningful state change emits a
   first-class trigger into the existing `TriggerRegistry`; Automations subscribe. New trigger types:
   - `pipeline_stage_entered` / `pipeline_stage_exited` (fired from `pipeline.moveDeal`)
   - `list_member_added` / `list_member_removed`
   - generalise `crm_contact_type` → `contact_field_changed`
   Records and boards *emit*; Automations *react*. The coupling lives in the event registry, never in
   a shared schema.
4. **The Kanban view IS the board; Automations are stage hooks.** We do **not** re-render the
   Automation builder as a Kanban. The linear node-graph builder stays — it is the right shape for
   "what happens at one stage" (enter *Proposal* → send email → generate doc). The board is the macro
   view (records across stages); the node graph is the micro view (the recipe at one stage). The
   "unified automation view" the team wants is the **board with per-stage automation badges**.

Phasing (each step is independently shippable and not wasted under either answer to the open question):
1. Add `pipeline_stage_entered` trigger + fire it from `moveDeal` — proves the spine.
2. Generalise `crm_contact_type` → `contact_field_changed`.
3. Extract `Board`/`Stage` off `Project` into a generic staged-board primitive.
4. Stage-attached automation UI on the board (each column shows its entry-automations).
Leave `Collection` untouched unless a concrete *staged-list* need appears — and if it does, it is a
**Board over contacts**, not a stage-ified `Collection`.

## Considered alternatives

- **One merged "Collection-with-stages-and-automations" primitive.** Rejected: flattens
  many-to-many stateless membership and one-per-board stateful stage into one model, demotes the
  typed `Deal` into `memberId` + sidecars, and re-litigates ADR-0008 and ADR-0030. More unified,
  less correct.
- **Keep firing Automations only on field changes; drag-to-move stays inert.** Rejected: leaves the
  board and the engine permanently disconnected — the exact gap the team feels.
- **Re-render the Automation builder as a Kanban.** Rejected: an Automation is a *recipe* (an ordered
  list of actions), not a *set of cards across columns*; forcing one widget to be both is what makes
  this feel awkward today.

## Consequences

- A new family of `*_entered` / `*_exited` / `*_changed` triggers in `TriggerRegistry`; the CRM
  registers the pipeline/list/contact ones, consistent with ADR-0029's "CRM is one consumer."
- `PipelineStage` becomes a generic `Board`/`Stage` primitive decoupled from `Project` (a migration);
  `Deal` stays typed.
- `Collection`/List is unchanged.
- The engine's linear, all-or-nothing-per-step rule (ADR-0025/0029) is unchanged; new triggers feed
  the same `WorkflowEngine.execute(def.id, …, initialInput)` path.
- **Open question, deliberately deferred:** whether Automations stay **stateless reactions**
  (fire-on-transition, forget) or become **stateful enrollments** (a record durably *sits* at "step 3
  of onboarding", surfaced as its own board — the HubSpot model). The event-layer work above is
  required either way, so it is built first; the stateful-enrollment bet is decided only after the
  stage-trigger version is in real use.
