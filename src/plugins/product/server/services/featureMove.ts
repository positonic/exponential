/**
 * Feature move planner (ADR-0027) — the single source of truth for what a
 * cross-workspace Feature move does. Both the confirm-dialog preview and the
 * executed mutation derive from {@link planFeatureMove}, so the preview can
 * never disagree with what actually happens.
 *
 * This module is **pure**: no DB, no I/O, no `Date`/`Math.random`. The caller
 * fetches the Feature graph and the destination context, calls
 * `planFeatureMove`, and applies the returned mutations inside one transaction.
 *
 * The cascade is lossy by design — moving a Feature across a workspace boundary
 * re-homes or severs a graph of workspace- and product-scoped relations. Every
 * loss is both applied (via {@link MovePlanMutations}) and counted (via
 * {@link MoveLossSummary}) so the user sees the consequences before committing.
 *
 * The rules are implemented incrementally across the move tickets:
 *   - Feature-level severances (goal / insights / workspace-scoped tags): here.
 *   - Ticket renumbering into the destination sequence: see `ticketRenumber`.
 *   - Per-ticket severances (cycles / dependencies / assignees / actions): see
 *     the corresponding `*TicketIds` / `dropDependencyIds` fields.
 */

import { allocateTicketNumbers } from "./ticketRenumber";

// ── Input: the fetched Feature graph ────────────────────────────────────────

/** A `FeatureTag` join row, carrying its tag's workspace scope. */
export interface MoveFeatureTag {
  tagId: string;
  /** `null` = global tag (kept); non-null = workspace-scoped (dropped). */
  tagWorkspaceId: string | null;
}

/** A `TicketDependency` edge incident to one of the moving tickets. */
export interface MoveTicketDependency {
  id: string;
  ticketId: string;
  dependsOnId: string;
}

/** A Ticket in the moving set (the Feature's Tickets). */
export interface MoveTicket {
  id: string;
  number: number;
  shortId: string | null;
  cycleId: string | null;
  assigneeId: string | null;
  /** Ids of child Actions linked to this ticket (`Action.ticketId`). */
  childActionIds: string[];
}

export interface FeatureMoveGraph {
  featureId: string;
  /** Source workspace's Goal alignment — nulled on a cross-workspace move. */
  goalId: number | null;
  tags: MoveFeatureTag[];
  /** `FeatureInsight.insightId`s — product-scoped, dropped on move. */
  insightIds: string[];
  tickets: MoveTicket[];
  /** All dependency edges touching any moving ticket (deduped by id). */
  dependencies: MoveTicketDependency[];
}

// ── Input: the destination context ──────────────────────────────────────────

export interface FeatureMoveDestination {
  productId: string;
  /** Destination Product's current `ticketCounter` (monotonic number source). */
  ticketCounter: number;
  /** Destination Product's `funTicketIds` toggle (drives shortId generation). */
  funTicketIds: boolean;
  /** Numbers already used in the destination Product. */
  usedNumbers: number[];
  /** ShortIds already used in the destination Product. */
  usedShortIds: string[];
  /** User ids of destination-workspace members (any role). */
  memberUserIds: string[];
}

// ── Output: the plan ────────────────────────────────────────────────────────

export interface TicketRenumber {
  ticketId: string;
  number: number;
  shortId: string | null;
}

export interface MovePlanMutations {
  featureId: string;
  destinationProductId: string;
  /** Whether to null `Feature.goalId`. */
  nullGoal: boolean;
  /** `FeatureInsight.insightId`s whose join rows are deleted. */
  dropInsightIds: string[];
  /** `FeatureTag.tagId`s whose join rows are deleted (workspace-scoped tags). */
  dropTagIds: string[];
  /** All moving ticket ids (re-pointed to the destination Product). */
  ticketIds: string[];
  /** New number/shortId for each moving ticket, from the destination sequence. */
  ticketRenumber: TicketRenumber[];
  /** Ticket ids whose `cycleId` is cleared. */
  clearCycleTicketIds: string[];
  /** Ticket ids whose `assigneeId` is cleared (assignee not in destination ws). */
  clearAssigneeTicketIds: string[];
  /** `TicketDependency` ids dropped (cross-boundary edges). */
  dropDependencyIds: string[];
  /** Ticket ids whose child Actions are unlinked (`Action.ticketId` → null). */
  unlinkActionTicketIds: string[];
  /** Destination Product's `ticketCounter` after allocating moved numbers. */
  nextTicketCounter: number;
}

export interface MoveLossSummary {
  ticketsMoved: number;
  ticketsRenumbered: number;
  cyclesDropped: number;
  dependenciesPreserved: number;
  dependenciesDropped: number;
  assigneesCleared: number;
  childActionsUnlinked: number;
  goalAlignmentRemoved: boolean;
  insightLinksDropped: number;
  tagsDropped: number;
}

export interface MovePlan {
  mutations: MovePlanMutations;
  loss: MoveLossSummary;
}

/**
 * Compute the full move plan for re-pointing a Feature at `destination`.
 *
 * Feature-level rules (this slice):
 *   - `goalId` is nulled (the Goal lives in the source workspace).
 *   - All `FeatureInsight` links are dropped (Insights stay with the source).
 *   - Workspace-scoped tags are dropped; global tags (`workspaceId === null`)
 *     are kept.
 *   - PRD body, scopes, user stories, and comments are carried unchanged (they
 *     hang off the Feature row, which is not deleted — nothing to do here).
 *
 * Ticket migration (renumbering) is applied here; per-ticket severances
 * (cycles / dependencies / assignees / actions) are layered in by a later
 * slice. For a ticket-less Feature the ticket-related outputs are empty.
 *
 * `generateShortId` is forwarded to the renumber allocator so callers (and
 * tests) can supply a deterministic shortId generator; it defaults to the
 * random one.
 */
export function planFeatureMove(
  graph: FeatureMoveGraph,
  destination: FeatureMoveDestination,
  generateShortId?: (taken: Set<string>) => string,
): MovePlan {
  const dropTagIds = graph.tags
    .filter((t) => t.tagWorkspaceId !== null)
    .map((t) => t.tagId);

  const ticketIds = graph.tickets.map((t) => t.id);
  const movingSet = new Set(ticketIds);

  // Tickets travel with the Feature, renumbered into the destination sequence
  // (per-product numbering forbids carrying their source numbers across).
  const { assignments, nextTicketCounter } = allocateTicketNumbers({
    ticketIds,
    ticketCounter: destination.ticketCounter,
    usedNumbers: destination.usedNumbers,
    funTicketIds: destination.funTicketIds,
    usedShortIds: destination.usedShortIds,
    generateShortId,
  });

  // Per-ticket severances (the lossy cross-boundary contract):
  const destMembers = new Set(destination.memberUserIds);
  // Cycle: source-Product cycles don't exist in the destination Product.
  const clearCycleTicketIds = graph.tickets
    .filter((t) => t.cycleId !== null)
    .map((t) => t.id);
  // Assignee: kept only when the assignee is a destination-workspace member.
  const clearAssigneeTicketIds = graph.tickets
    .filter((t) => t.assigneeId !== null && !destMembers.has(t.assigneeId))
    .map((t) => t.id);
  // Child Actions: stay in the source workspace/Project, ticketId nulled. We
  // record which tickets *have* actions (the mutation nulls them by ticketId).
  const ticketsWithActions = graph.tickets.filter(
    (t) => t.childActionIds.length > 0,
  );
  const unlinkActionTicketIds = ticketsWithActions.map((t) => t.id);
  const childActionsUnlinked = ticketsWithActions.reduce(
    (sum, t) => sum + t.childActionIds.length,
    0,
  );
  // Dependencies: keep an edge only when BOTH endpoints move (still same-Product
  // after the move); drop edges that cross to tickets left behind. De-dupe by
  // id so an edge counted from either endpoint isn't double-counted.
  const seenDeps = new Set<string>();
  let dependenciesPreserved = 0;
  const dropDependencyIds: string[] = [];
  for (const dep of graph.dependencies) {
    if (seenDeps.has(dep.id)) continue;
    seenDeps.add(dep.id);
    const bothMove = movingSet.has(dep.ticketId) && movingSet.has(dep.dependsOnId);
    if (bothMove) {
      dependenciesPreserved += 1;
    } else {
      dropDependencyIds.push(dep.id);
    }
  }

  const mutations: MovePlanMutations = {
    featureId: graph.featureId,
    destinationProductId: destination.productId,
    nullGoal: graph.goalId !== null,
    dropInsightIds: [...graph.insightIds],
    dropTagIds,
    ticketIds,
    ticketRenumber: assignments,
    clearCycleTicketIds,
    clearAssigneeTicketIds,
    dropDependencyIds,
    unlinkActionTicketIds,
    nextTicketCounter,
  };

  const loss: MoveLossSummary = {
    ticketsMoved: ticketIds.length,
    ticketsRenumbered: assignments.length,
    cyclesDropped: clearCycleTicketIds.length,
    dependenciesPreserved,
    dependenciesDropped: dropDependencyIds.length,
    assigneesCleared: clearAssigneeTicketIds.length,
    childActionsUnlinked,
    goalAlignmentRemoved: mutations.nullGoal,
    insightLinksDropped: mutations.dropInsightIds.length,
    tagsDropped: dropTagIds.length,
  };

  return { mutations, loss };
}
