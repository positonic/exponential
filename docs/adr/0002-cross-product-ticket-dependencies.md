# Cross-Product ticket dependencies, scoped to Workspace

## Status

Accepted — 2026-05-15

## Context

`TicketDependency { ticketId, dependsOnId }` is the canonical "depends on" relation between two tickets. Today the table has no schema-level Product constraint — but the application router rejects any insert where the two tickets belong to different Products ([`src/plugins/product/server/routers/ticket.ts:535`](../../src/plugins/product/server/routers/ticket.ts#L535)). The `ticket.search` endpoint further scopes results to a single `productId`, so the "Add dependency" combobox cannot surface foreign tickets.

This is a poor reflection of how multi-Product workspaces actually work. A workspace like `syntrofi` owns several Products (`clear-frontend`, `clear-api`, …) that ship a single value stream — frontend features routinely wait on backend endpoints, and vice versa. The current rule forces teams into a "tracer ticket" workaround: a placeholder ticket inside one Product that stands in for real work in another, manually kept in sync. That pattern degrades the dependency graph's value (it doesn't reflect reality), invites stale state, and pushes coordination cost onto humans.

The forthcoming **Dependency graph** view on the product detail page is the trigger for resolving this: a graph that pretends cross-Product dependencies don't exist would, for any real Product, be misleading.

## Decision

1. **Same-Workspace is the new boundary**, not same-Product. Two tickets can be linked via `TicketDependency` iff their Products belong to the same Workspace.
2. **`ticket.addDependency` is updated** to replace the same-Product check with a same-Workspace check, and to assert the caller is a member of *both* workspaces (always the same workspace under this rule, but explicit).
3. **`ticket.search` gains a Workspace-scoped mode** — keeping the existing Product-scoped mode as default for in-Product combobox usage, and adding a workspace-wide mode for the "Add dependency" combobox once the graph view ships.
4. **`wouldCreateCycle` is untouched.** It traverses `TicketDependency` rows directly and has never relied on Product scoping; it remains correct across Products.
5. **No `FeatureDependency` table** is introduced. Cross-Product blocking flows entirely through Ticket↔Ticket. A Feature is "effectively blocked" iff at least one of its Tickets has `openBlockerCount > 0`; this is computed at read time, not stored.
6. **Workspace stays the hard boundary.** Cross-Workspace dependencies remain forbidden — Workspaces are the tenancy and permission boundary throughout this app, and crossing them would shred access control.

## Considered alternatives

- **Keep same-Product, use tracer tickets.** Rejected: matches the data model but not reality; pushes sync cost onto users; produces dependency graphs that omit the real reasons work is blocked.
- **Also add a `FeatureDependency` table.** Rejected for v1: Feature-level blocking is rarely declared independently — it gets discovered at ticketization. Adding the table now would expand the surface area (new model, new UI, new cycle check, new graph node-type) for a use case we have no concrete demand for. Re-evaluate if PMs start asking for "this Feature blocks that Feature" before tickets exist.
- **Allow cross-Workspace dependencies.** Rejected: Workspace is the tenancy boundary. Cross-Workspace deps would require either downgrading access control (a member of Workspace A could see Tickets in Workspace B via a transitive link) or a federation model that's far heavier than the value justifies. Almost every real-world case fits inside one Workspace.

## Consequences

- The `Dependency graph` view can render **ghost nodes** for cross-Product blockers — foreign-Product tickets reachable via a 1-hop blocking edge, drawn with a Product chip and click-through to that Product. The graph never recursively loads other Products; only the entangled tickets are fetched.
- Cycle detection now spans the whole Workspace's ticket DAG. Acceptable: `TicketDependency` rows are sparse, the existing BFS already handles arbitrary graphs, and Workspaces are bounded in practice.
- `openBlockerCount` semantics are unchanged: the computed flag counts non-completed `Depends on` tickets regardless of their Product. This means a ticket can show as `isBlocked: true` while every *in-Product* dependency is done — the blocker lives in a sibling Product. That is the correct behaviour.
- Search UX gets a mode switch: in-product (existing combobox, default) vs. workspace-wide (graph "Add cross-product blocker" affordance). The latter requires a clear Product chip on each result to prevent confusion.
- Access control diverges slightly: a user must be a member of *both* the depending ticket's Workspace and the dependent's Workspace — under this ADR they will always be the same Workspace, but the assertion is written explicitly so a future relaxation doesn't silently broaden permissions.
- The "tracer ticket" pattern, where used, becomes redundant. Existing tracer tickets are not migrated automatically; teams clean them up over time.
