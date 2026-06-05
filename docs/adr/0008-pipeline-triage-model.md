# Pipeline triage modelled as four distinct gates — not collapsed, not a dynamic-table engine

## Status

Accepted — 2026-06-05

## Context

We want Exponential to host our **Data Product Strategy** / **Pipeline Triage & Prioritisation Process**: moving work from raw signal to committed delivery through gates — `Problem → Hypothesis → Approach → Roadmap / Backlog`. Today this lives in Notion. The process's explicit thesis is that **Problem, Hypothesis, and Approach are separate gate-questions** ("Is it real? / Is it right? / Is it worth building?") and that *collapsing them is how teams ship clever solutions to problems nobody had.*

The product plugin already has `Product`, `Feature`, `Ticket`, `Research`, `Insight`, `Retrospective`, and a `DependencyGraphService`; the core schema has `Project` (which a Product owns, [ADR-0003](0003-product-owns-projects.md)). None of these models a "validated problem" or a "falsifiable claim".

Building "another table" for each Notion database was unappealing enough that a **runtime user-defined / dynamic-table (Airtable-style) engine** was considered. We decided the need is **internal and bounded** (a small, known set of product-team schemas), not a no-code platform for end users — so a typed model is the right tool, and the dynamic engine is deferred indefinitely.

## Decision

1. **Four gates, three modelling treatments.**
   - **Problem** — a new first-class model in the product plugin, scoped to a Product. Holds the statement ("who's hurt and how"), evidence, an `Idea → Qualified → Prioritised` lifecycle, and **`impact`/`confidence`** scores (the two prioritisation axes; **ease is deliberately not scored on a Problem** — it lives on the Approach).
   - **Hypothesis** — a new *lightweight child* of a Problem (`statement`, `result`/measurement plan, status `Proposed → Testing → Confirmed → Refuted → Parked`). Rendered inline on the Problem, the size of a `UserStory`. **Not a Project.**
   - **Approach** — *the existing core `Project`*, not a new model. A pursued approach is real deliverable work (repo, actions, DRI). Flavoured Test vs Implementation; scored on effort. A `Problem ↔ Project` join expresses "Approaches".
   - **Roadmap / Backlog** — **not a table.** A confirmed Implementation Approach (Project) that is scheduled (Roadmap, with timing) or validated-but-unscheduled (Backlog). A roadmap is a **view/state over Projects**.
2. **Problem is distinct from Insight.** Insight is raw evidence from research; Problem is the committed issue entering the pipeline. (A future `Insight → Problem` evidence edge is allowed but unbuilt.)
3. **Parking is cross-cutting**, modelled as `parkedAt` + `parkReason` on Problem, Hypothesis, and Approach — independent of lifecycle status, never a delete.
4. **No dynamic-table engine.** Typed first-class Prisma models; runtime end-user-defined tables are explicitly out of scope.
5. **Phased delivery.** v1 = Problem (Stages 1–2). v2 = Hypothesis (Stage 3). v3 = Approach↔Project link + Roadmap/Backlog state + the `Project.type` query-guard cleanup (Stage 4).

## Considered alternatives

- **Hypothesis as a Project.** Rejected: a Hypothesis is not work (no actions/DRI/deliverable); its lifecycle is *epistemic* (a Project never gets "Refuted"); each Problem spawns several, which would flood the ~21 project-consuming surfaces; and it collapses gate 2 (is the hypothesis right?) into gate 3 (is the approach worth building?) — the exact merge the process exists to prevent.
- **Approach as its own model.** Rejected: an approach you pursue *is* a Project (it has a repo, status, actions); a separate table forces double-entry on promotion and a parallel structure forever. Matches the strategy diagram's middle box.
- **Expand `Insight` to hold Problems.** Rejected: different lifecycles (a `PERSONA` insight never triages), a wide-nullable table, and an overloaded glossary term. See CONTEXT.md "Problem" vs "Insight".
- **Dynamic / EAV table engine (Notion/Airtable clone).** Rejected: untyped property bags can't hold real FKs into `Feature`/`Project`, severing the pipeline from the typed alignment chain and `DependencyGraphService`; fights the repo's `no-any` / typed-tRPC rules; months to build and own. The actual pain is CRUD/list boilerplate, addressed by a reusable Table+Triage scaffold instead.

## Consequences

- New `Problem` and `Hypothesis` models in the product plugin; a `Problem ↔ Project` join table.
- The latent `Project.type` gap must finally be closed in v3: `project.getAll` has **no type filter today**, so Approach/pipeline projects would leak into all project lists. `getAll` will default to `STANDARD` and callers opt into other types — which also fixes the existing deal-`pipeline` leak. (`Project.type` likely becomes an enum.)
- The static `/roadmap` marketing page is unrelated and stays as-is; "Roadmap" as a product surface is a Project view, built in v3.
- A reusable **Table + Triage (kanban) board** component should be *extracted* when the second pipeline entity (Hypothesis) is built — not abstracted prematurely from Problem alone. Tracked separately.
- CONTEXT.md gains a "Pipeline triage" section locking the vocabulary (`Problem`, `Hypothesis`, `Approach`, `Roadmap/Backlog`, `Parked`).
