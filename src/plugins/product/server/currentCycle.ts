/**
 * Read-only "current cycle" selection, shared by the product overview
 * (`product.getOverview`) and the workspace-home cycle block
 * (`yourWork.currentCycles`). Cycles are workspace-scoped `List` rows with
 * `listType: SPRINT`; the canonical status transitions happen lazily in
 * `cycle.list` (`reconcileCycleStatuses`), so this predicate deliberately
 * tolerates un-reconciled rows instead of mutating: an ACTIVE sprint that
 * hasn't ended, a PLANNED one whose window contains `now`, or an ACTIVE one
 * that ended but was never reconciled to COMPLETED.
 */
export function currentCycleWhere(workspaceId: string, now: Date) {
  return {
    workspaceId,
    listType: "SPRINT" as const,
    OR: [
      {
        status: "ACTIVE" as const,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      {
        status: "PLANNED" as const,
        startDate: { lte: now },
        endDate: { gt: now },
      },
      { status: "ACTIVE" as const, endDate: { lte: now } },
    ],
  };
}

/**
 * Deterministic pick when several sprints qualify (e.g. parallel team cycles
 * with the same startDate) — id breaks the tie so the same cycle is always
 * chosen.
 */
export const currentCycleOrder = [
  { startDate: "desc" as const },
  { id: "desc" as const },
];
