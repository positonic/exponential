# A Product owns Projects via a nullable FK on the core Project model

## Status

Accepted — 2026-05-29

## Context

`Product` (and its Features, Tickets, Research, Retrospectives) lives in the Product-management plugin at [`src/plugins/product/`](../../src/plugins/product/). `Project` (and its Actions) is a core model in [`prisma/schema.prisma`](../../prisma/schema.prisma#L713). Until now the two were unrelated — a Product owned product-management artefacts, a Project owned meeting-extracted Actions, and nothing tied them together.

The trigger is a new **Products & Projects** view (a sibling tab on the products surface, modelled on the existing Projects & Tasks view) that needs to render Projects nested under the Product that owns them. That view is meaningless without a real ownership edge: "Products & Projects" modelled on "Projects & Tasks" implies Product→Project is the same kind of containment as Project→Action.

## Decision

1. **A Product owns zero-or-more Projects, one-to-many.** Add `productId String?` to the core `Project` model, with `product Product? @relation(...)` on `Project` and `projects Project[]` on `Product`. This mirrors the established `Action.projectId` containment pattern exactly.
2. **The FK is nullable and the link is opt-in.** Every existing project starts unassigned (`productId = null`); there is no backfill and nothing to infer. Unassigned projects render in an "Unassigned" group in the new view.
3. **`onDelete: SetNull`.** Deleting a Product unlinks its Projects (they survive as Unassigned) rather than deleting them. Projects are core, first-class, and predate/outlive Products — Cascade (which Product→Ticket/Feature use) would silently destroy real project and action data.
4. **Same-Workspace scoping.** A Project may only be linked to a Product in the same Workspace. The assignment selector (in the project create/edit modal) and the inline picker (in the Products & Projects view) only offer products from the project's workspace.

## Considered alternatives

- **`ProductProject` join table (many-to-many).** Rejected: a Project belonging to several Products makes "which product owns this" ambiguous, the same project shows under multiple parents in the expand view, and the inline "move to product" UX gets murky. We have no demand for a project spanning products; a nullable FK is simpler and matches Action→Project.
- **Cascade delete (mirror Product→Ticket).** Rejected as dangerous — see decision 3. Tickets/Features are plugin-scoped and meaningless outside their Product; Projects are not.
- **Group by shared Objective instead of ownership.** Both Products (Feature→Goal) and Projects (GoalProjects) align to Objectives, so the view could nest both under their Objective with no new link. Rejected: it answers a different question (strategic alignment, already served by the alignment chain and dependency graph) and gives a fuzzier mental model than direct ownership.
- **No relationship; render two independent lists.** Rejected: loses the expand-parent-to-see-children interaction that motivated the view.

## Consequences

- **The core `Project` model now references a plugin `Product` model** — a deliberate core→plugin coupling, the reverse of the usual plugin→core direction. Acceptable because it is a single Prisma schema and one database; the FK is nullable so core behaviour is unaffected when the plugin is unused. Noted explicitly so a future reader does not "fix" the direction.
- A new tRPC query is needed to fetch products with their projects plus the workspace's unassigned projects for the view; `project.create`/`project.update` gain an optional `productId`.
- Deleting a Product is now a safe, non-destructive operation with respect to Projects, but a Product's project count can silently drop to zero via unlink — not via project deletion.
