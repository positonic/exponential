# Moving a Feature across workspaces re-points its Product and migrates Tickets with defined lossy severances

## Status

Accepted — 2026-06-18

## Context

A `Feature` (`prisma/schema.prisma`, in the Product-management plugin) has **no workspace field**. Its only container link is `Feature.productId → Product`, and a `Product` carries `workspaceId`. So a Feature's workspace is *derived through its Product*. The product surface (`/w/[slug]/products/[productSlug]/features/[featureId]`) shows a PROPERTIES sidebar of inline-editable fields (Status, Priority, …), and the request was to add a control there to "move this feature to another workspace, picking from a dropdown of my workspaces".

That request collides with the model: there is nothing on a Feature to repoint at a workspace, and a workspace owns zero or many Products, so a bare workspace dropdown is underspecified. A Feature is also not a leaf — it **groups Tickets** (`Ticket.featureId`), and Tickets are hard-scoped to one Product:

- `Ticket.productId` is **required** (not nullable), with `@@unique([productId, number])` and `@@unique([productId, shortId])` — per-product numbering.
- Tickets carry a product-scoped `cycleId`, same-product-enforced `TicketDependency` edges, an `assigneeId`, and child `Action`s (which have their *own* `workspaceId`/`projectId` — the delivery hierarchy).

A Feature additionally aligns to a Goal in its own workspace (`Feature.goalId`; the existing `feature.update` mutation already rejects cross-workspace goals), links product-scoped `Insight`s via `FeatureInsight`, and carries `FeatureTag`s (tags are `workspaceId`-scoped, or global when null).

So a cross-workspace move cannot be a quiet field edit — moving the Feature necessarily re-homes or severs a graph of workspace- and product-scoped relations.

## Decision

1. **Move to a Product, presented as workspace → Product.** The operation re-points `Feature.productId` at a Product in the destination workspace. The UI is an explicit **Move** widget — a button opening a confirm modal with a two-step picker (workspace, then Product) — **not** an always-live inline dropdown in PROPERTIES. A move is a lossy cascade, not a field edit, and must not fire on a stray click.

2. **Member-of-both, role-gated.** The mover must be a non-viewer member (owner/admin/member) of **both** the source and destination workspaces. The workspace picker lists only workspaces where the user is owner/admin/member (`hasMinimumWorkspaceRole`, excluding viewer); the Product picker lists only Products in the chosen workspace. The server re-checks destination membership/role in addition to the existing source check in `loadFeatureWithAccess`.

3. **Tickets migrate with the Feature.** The Feature's Tickets are re-pointed to the destination Product in the same transaction (rather than orphaned in the source Product, or the move being blocked when tickets exist).

4. **Defined lossy severances, run as one transaction.** The move carries the Feature's PRD body, scopes, user stories, and comments unchanged, and applies:
   - **Renumber** moved tickets' `number`/`shortId` from the destination Product's sequence (forced by `@@unique([productId, …])`).
   - **Drop ticket `cycleId`** (source cycles don't exist in the destination Product).
   - **Drop ticket dependencies that cross the boundary**; **preserve** dependencies where *both* endpoints are in the moving set (still same-product after the move).
   - **Clear `assigneeId`** for assignees who are not members of the destination workspace.
   - **Sever child Actions' `ticketId`** (set null) — Actions stay in their source workspace/Project; the moved ticket arrives action-less. The two hierarchies (Feature→Ticket vs. Project→Action) stay cleanly separate.
   - **Null `Feature.goalId`** (the Goal lives in the source workspace; cross-workspace alignment is invalid).
   - **Drop `FeatureInsight` join rows** (Insights are product-scoped and stay with the source Product).
   - **Drop workspace-scoped tags**; keep global tags (`Tag.workspaceId = null`).

5. **The confirm dialog enumerates every loss** (count of tickets renumbered, cycles/dependencies/insights/tags dropped, actions unlinked, goal alignment removed) before the user commits.

## Considered alternatives

- **Literal workspace dropdown landing in a default Product.** Rejected: ambiguous when a workspace has many Products and undefined when it has none. The two-step picker keeps the destination Product explicit and truthful to the model.
- **Tickets stay behind (orphan), Feature arrives empty.** Rejected for the primary flow: a Feature minus its Tickets is not the same Feature, and silent orphaning in the source Product is its own surprise. (This is effectively what happens to Actions, by decision 4 — but Actions belong to meetings/Projects, not the Feature.)
- **Block the move when the Feature has Tickets.** Rejected as too restrictive for real use; it punts the hard problem onto the user with no path forward.
- **Move child Actions too.** Rejected: Actions belong to meetings and Projects in the source workspace; dragging them across would require choosing a destination Project and would break meeting linkage. Severing `ticketId` is the lesser loss.
- **Inline always-live workspace `<Select>` in PROPERTIES** (mirroring Status/Priority). Rejected: those are reversible single-field edits; a cross-workspace move is a multi-entity, partially irreversible cascade and demands an explicit confirm step.

## Consequences

- **Ticket numbers are not stable across a move.** Any external reference that encoded a ticket's `number`/`shortId` (links, mentions) will point at a renumbered ticket. `prUrl` and other fields are preserved, but the human-facing number changes.
- A new `feature.move` mutation is needed (source + destination access checks, the transactional cascade above); the existing inline PROPERTIES edits are untouched. The Move widget needs a query for "workspaces I can write to" and "Products in workspace W".
- The cascade is **lossy by design** — the confirm dialog is the safety mechanism, so it must stay in sync with the rules in decision 4. If a future relation is added to `Feature`/`Ticket`, the move logic and the dialog must be updated together.
- Moving is **not symmetric with undo**: dropped dependencies, cleared assignees, and severed links are not restored by moving the Feature back. Treat a move as a deliberate, confirmed action.
