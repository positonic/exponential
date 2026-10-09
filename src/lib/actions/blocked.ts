/**
 * Blocked state of an Action, derived from its `depsOut` edges (the actions
 * it is blocked by). Pure, so the routers, the agenda queries and the cards
 * all agree by construction (the one-source-of-truth pattern of ADR-0007).
 *
 * A blocker is *open* while its coarse status is `ACTIVE`; a completed,
 * cancelled, deleted or draft blocker no longer blocks. The blocked action
 * itself is only "blocked" while it is still ACTIVE — a finished action with
 * unfinished blockers is history, not a problem. Mirrors the ticket rule
 * (`openBlockerCount` / `isBlocked` in the ticket router).
 */

export interface BlockerEdge {
  dependsOn: { status: string };
}

export interface ActionBlockedState {
  /** Blockers whose coarse status is still `ACTIVE`. */
  openBlockerCount: number;
  /** `openBlockerCount > 0` and the action itself is still `ACTIVE`. */
  isBlocked: boolean;
}

export function isOpenBlocker(edge: BlockerEdge): boolean {
  return edge.dependsOn.status === "ACTIVE";
}

export function deriveActionBlocked(action: {
  status: string;
  depsOut?: BlockerEdge[] | null;
}): ActionBlockedState {
  const openBlockerCount = (action.depsOut ?? []).filter(isOpenBlocker).length;
  return {
    openBlockerCount,
    isBlocked: openBlockerCount > 0 && action.status === "ACTIVE",
  };
}

/** Spread the derived state onto a row (the shape the list procedures return). */
export function withBlockedState<T extends { status: string; depsOut?: BlockerEdge[] | null }>(
  action: T,
): T & ActionBlockedState {
  return { ...action, ...deriveActionBlocked(action) };
}
