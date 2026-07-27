# Product Roadmap is a derived cross-product status view, not a stored entity

## Status

Accepted — 2026-06-30. Sits alongside the **Roadmap / Backlog** glossary entry in
[CONTEXT.md](../../CONTEXT.md) (the strategy-pipeline state over Projects) and reuses the
`Feature.goalId` alignment edge from the **Product alignment chain**.

## Context

The products area shows one Product at a time (`/products`, `/products-grid`,
`/products-projects`). There is **no view across all Products**, and the **OKR**s
(`/goals?tab=okrs`) live in a parallel surface with no on-screen link to the Features that serve
them. The gap the team feels: *"what is every product building, and which Objective does each
thing serve?"* — answerable today only by opening each Product and cross-referencing the goals
page by hand.

Two framings were in tension:

- The user's word for the fix is **"Product Roadmap."** But the glossary already reserves
  **Roadmap** for *committed Projects with timing* (a view/state over `Project`, no table), and the
  per-Product dependency-graph view **deliberately avoids the word** because it "carries timeline
  connotations." A naive read would make the new screen a Gantt over Projects.
- What the team actually wants first is **"a simple Kanban across all products, by Feature
  status"** — which has *no time axis at all* and is over **Features**, not Projects.

So the new artifact collides head-on with an existing, correct term. The pieces to build it already
exist: `FeatureStatus` (`IDEA → DEFINED → IN_PROGRESS → SHIPPED → ARCHIVED`) gives columns,
`Feature.goalId` gives the Objective bridge, `Product.icon`/`color` give card badges, and
`feature.update` already mutates both `status` and `goalId` under an access check. The only missing
server piece is a workspace-wide (all-Products) Feature fetch; `feature.list` is per-Product today.

## Decision

**Build the Product Roadmap as a derived read-side view — no new table — and keep it deliberately
status-based, not time-based.** It is a *fourth tab* in the products area
(`/products-roadmap`), composing `Feature` + `Goal` that already exist.

1. **No `Roadmap`/`RoadmapItem` entity.** The board is a query over `Feature` joined to its `Goal`.
   This reaffirms the existing "there is no Roadmap table" stance rather than overturning it. A
   stored planning artifact (bets that exist before any Feature) is explicitly *not* built now; it
   would earn its own ADR if a real need for objective-less, feature-less bets appears.
2. **Columns are `Feature.status`.** Active columns are `IDEA / DEFINED / IN_PROGRESS / SHIPPED`.
   `ARCHIVED` is a hidden filter, not a column. `SHIPPED` is **time-bounded** (default: the current
   OKR `period`) so the board stays "in-flight + recently landed," not an archive. v1 bounds
   `SHIPPED` by `Feature.updatedAt` (a coarse proxy); `FeatureScope.shippedAt` is the precise signal
   for a later refinement.
3. **Rows are swimlanes by Objective.** Each Feature sits under the Objective it aligns to
   (`Feature.goalId`), with an **Unaligned** lane for `goalId = null` — itself a governance signal
   ("we are building things that serve no OKR"). The swimlane grouping is what makes this the
   **OKR ↔ per-Product-delivery bridge** and what earns the name "Roadmap" rather than "Board." It
   collapses to a flat status Kanban via a "group by: Objective / none" toggle.
4. **Full drag, reusing `feature.update`.** Horizontal drag changes `status`; vertical drag into a
   lane *header* re-aligns `goalId` (drag an Unaligned card up into an Objective lane to align it).
   Both inherit `feature.update`'s access check, so a viewer gets a read-only board for free. The
   header-only drop-zone for re-alignment keeps a status drag from silently re-homing the OKR.
5. **The word "Roadmap" is taken, and the glossary disambiguates the collision** rather than
   redefining the old term. Two distinct entries now coexist: **Product Roadmap** (Features by
   *status*, a tab) and **Roadmap** (Projects with *timing*, a pipeline state). Same word, different
   entity and different axis — called out in both entries' `_Avoid_` lines.

## Considered alternatives

- **A new `Roadmap`/`RoadmapItem` table** you draw bets on before Projects/Features exist. Rejected
  for v1: contradicts the standing "no Roadmap table" decision, adds a migration, and answers a need
  (feature-less bets) no one has yet expressed. Revisit only with a concrete case.
- **A time-based Gantt over Projects** (the literal glossary meaning of "Roadmap"). Rejected as the
  *first* build: the team explicitly asked for a status Kanban over Features, and the Gantt machinery
  (`ProjectTimelineView`, `OkrTimeline`) already exists to build a separate timeline view later if
  wanted. Naming the status board "Roadmap" does not consume that future.
- **A plain cross-product "Board" with no OKR grouping.** Rejected: indistinguishable from the
  existing per-Product feature board scaled up, and drops the OKR-bridge half of the original ask.
  The Objective swimlane is the reason the view is worth its own tab and its own name.
- **Redefining the existing "Roadmap" term to mean this.** Rejected: "Roadmap = scheduled Projects"
  is a load-bearing node in the strategy pipeline (`Problem → Hypothesis → Approach → Roadmap |
  Backlog`); broadening it would blur that chain. Adding a distinct sibling term is cleaner than
  overloading a correct one.

## Consequences

- One new workspace-wide Feature query (all Products, lean card fields + `goal` + `product`); watch
  payload size. No schema migration.
- One new route/page + a fourth entry in `ProductsViewTabs`. No change to existing product views.
- Two near-homonym glossary terms now coexist by design; the `_Avoid_` cross-references carry the
  burden of keeping "Product Roadmap" (status/Features) and "Roadmap" (timing/Projects) apart.
- **Deferred, not rejected:** a precise `SHIPPED` window via `FeatureScope.shippedAt`, and a genuine
  time-based roadmap view — both are additive on top of this and neither is foreclosed.
