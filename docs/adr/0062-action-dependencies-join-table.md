# Action dependencies live in an `ActionDependency` join table, scoped to Workspace

## Status

Accepted — 2026-09-26. Sibling of [ADR-0002](0002-cross-product-ticket-dependencies.md) for the
Project → Action register.

## Context

Exponential runs two parallel work registers (`CONTEXT.md` "Product", [ADR-0050](0050-key-results-accept-feature-execution-links.md)):
Feature → Ticket for product-management work and Project → Action for delivery. Tickets could
declare "depends on" through `TicketDependency`, with a cycle check, a computed `isBlocked`, a
dependencies section and a graph. Actions could not — or rather, they half could: `Action` carried
two `String[]` columns, `blockedByIds` and `blockingIds`, the edit form wrote the first, nothing
ever wrote the second, no read surface showed either, and the ids had no foreign key, so a deleted
blocker lingered forever and a caller could name any id at all, readable or not.

So a project with many actions, which by design does *not* run the product plugin, had no honest
way to say "this cannot start until that is done". Teams fell back to numbering titles or writing
"after #3" into descriptions, which nothing (the agenda blockers query, sprint analytics, the weekly
plan's blocked-project check, Zoe) can read.

## Decision

1. **`ActionDependency { actionId, dependsOnId, createdById }`** replaces the two array columns,
   with the same shape and semantics as `TicketDependency`: one row per "action is blocked by
   dependsOn" edge, cascade on either end, `@@unique([actionId, dependsOnId])`. The arrays are
   backfilled into rows (dangling and self references dropped) and then dropped.
2. **Blocked state is derived, never stored.** `deriveActionBlocked` (`src/lib/actions/blocked.ts`)
   is the one definition: a blocker is *open* while its coarse status is `ACTIVE`, and an action is
   *blocked* while it is itself `ACTIVE` and has at least one open blocker. The list procedures
   return `openBlockerCount` / `isBlocked` from it; cards and the detail view render from the same
   function, so server and client cannot disagree.
3. **Writes go through the Action write module.** `blockedByIds` stays the input name on create
   and update (the set replaces the current edges; `undefined` leaves them alone), and both paths
   share `dependencies.ts`: a blocker must be an action the actor can read **in the same
   workspace** (a personal action can only be blocked by the actor's own), no self-links, and no
   cycles (BFS over `depsOut`, as tickets do). The edge and the row write commit together.
4. **Workspace is the boundary, as for tickets.** No cross-workspace edges, for the reason ADR-0002
   gives: the workspace is the tenancy and permission boundary and a dependency is a read path.
5. **No Action ↔ Ticket edges.** An Action that belongs to a Ticket (`Action.ticketId`) is already
   ordered by that ticket's dependencies; mixing the registers in one graph is a separate decision
   with no concrete demand yet.

## Considered alternatives

- **Keep the arrays and finish wiring them.** Cheapest. Rejected: no FK means no cascade cleanup
  and no join for "what does this block", and `blockingIds` would need to be mirrored by hand on
  every write, which is exactly the drift the ticket table avoids.
- **Use Tickets for project work.** Rejected: it forces a project onto the product plugin (cycles,
  points, ticket statuses) to get one relation, and contradicts ADR-0003, which keeps Projects
  first-class and independent of Products.
- **Encode ordering in titles or descriptions.** Rejected: invisible to every structured consumer.

## Consequences

- The migration (`20260926130000_action_dependencies`) creates the table, backfills the rows from
  the arrays and drops the two columns in one step; it is applied with the usual
  `npx prisma migrate deploy` (decision 2026-09-26: shipped directly to `main`, not batched via
  `develop`).
- Every action read that feeds a card carries `depsOut` (id, name, status, kanban column and
  project of each blocker); the agenda blockers section, sprint analytics and the workflow
  blockers step query the relation instead of the array.
- A future "blocks" view (what waits on this action) is a `depsIn` include away, and a dependency
  graph for a project can reuse the ticket graph's node and edge model.
