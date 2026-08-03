# Key results accept Features as execution links via a typed join table

## Status

Accepted — 2026-08-03

## Context

Exponential deliberately runs two parallel work registers ([CONTEXT.md](../../CONTEXT.md) "Product"): **Feature→Ticket** (product-management work, the permanent capability registry) and **Project→Action** (delivery/GTD endeavors). OKR alignment spans them asymmetrically: a Feature aligns to an **Objective** (`Feature.goalId`, powering the Product Roadmap swimlanes), but a **Key result**'s execution edge (`KeyResultProject`) accepts only Projects.

Since most product-shaped execution happens as Features/Tickets, teams fabricate **shadow projects** to satisfy the KR link. Live evidence in the `clear` workspace: projects like "Decision Speed & Time-to-Aid Optimization" and "Org Onboarding & 90-Day Retention" exist solely to mirror the KRs they're linked to, while the KRs the product work actually executes ("MVP deployed to NRC field users", "Ship ≥2 situational analysis modules") have zero linked work — the Clear product's 32 Features / 344 Tickets can't be linked at all. This is the concrete source of the "Features and Projects feel duplicative" dissonance: the KR edge forces a Project into existence when the executing work is a Feature.

## Decision

1. **Add `KeyResultFeature`**, a typed join table mirroring `KeyResultProject` exactly: `{ keyResultId, featureId, assignedAt }`, `@@unique([keyResultId, featureId])`, cascade on both FKs. A Key result's execution set is the union of its linked Projects and linked Features.
2. **Router symmetry**: `okr.linkFeature` / `okr.unlinkFeature` / `okr.updateLinkedFeatures` beside the existing project procedures, same workspace-membership guard; `okr.getById` / `okr.getByObjective` include linked Features alongside linked Projects.
3. **One UI list**: the OKR detail drawer renders both link types as a single "Executing work" list with a per-row type indicator. The picker offers the workspace's Projects and its Products' Features.
4. **Objective-alignment glue**: linking a Feature whose `goalId` is null sets it to the Key result's Objective; a Feature already aligned to a different Objective keeps its `goalId` (no silent overwrite).
5. **KR progress stays outcome-driven**: `KeyResult.currentValue` is never derived from linked work; check-ins remain the only write path. Linked work is traceability and (later) delivery *context*, not a progress formula.

## Considered alternatives

- **Merge Feature and Project into one entity.** Rejected: they serve different lives (permanent product-capability registry vs time-bound workspace endeavors — ~100 real GTD/client Projects exist with no Product). The split is the deliberate answer to Linear's most-complained-about gap (no persistent feature catalogue beyond a delivery window); merging recreates it, and the migration would touch scopes, requirements, tickets, roadmap views, and the whole GTD ritual layer.
- **Polymorphic `KeyResultContribution { entityType, entityId }`.** Rejected: loses FK integrity and cascade semantics on an execution edge. Repo precedent keeps ownership/execution edges typed ([ADR-0003](0003-product-owns-projects.md); EAV rejected in [ADR-0008](0008-pipeline-triage-model.md)); polymorphism-by-convention is reserved for low-stakes pins (`Favorite`, `CollectionMember` [ADR-0030](0030-generic-collection-list-primitive.md)).
- **Objective-level alignment only (pure OKR doctrine: KRs measure, never own work).** Would drop `KeyResultProject` instead of widening it. Rejected: KR→work traceability is demonstrably used at review time, and `Feature.goalId` is too coarse to answer "what is moving *this* number".
- **Auto-derive KR progress from linked-ticket completion.** Rejected: outputs are not outcomes; deriving `currentValue` from tickets is the classic OKR failure mode. (Delivery signal may be *displayed* beside a KR, never written into it.)

## Consequences

- Each future linkable work type means another typed join table — accepted; the only anticipated one is scope-level pinning, which lands as a nullable `scopeId` **on `KeyResultFeature`**, not a third table.
- `Feature.goalId` and KR links can disagree when a Feature executes a KR under a different Objective than it aligns to; the fill-on-null rule plus no-overwrite keeps this an explicit, visible state rather than a silent mutation.
- Data cleanup follows in `clear`: relink shadow projects' KRs to the real Features, then archive the shadow projects (keep genuinely real ones like "Webinar").
- `CONTEXT.md`'s **Key result** entry gains the execution-links sentence in the implementation PR.
