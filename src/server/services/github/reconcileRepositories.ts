/**
 * Reconcile a workspace's tracked GitHub repos against a desired selection
 * (ADR-0020, slice #3). Pure set-difference: returns which `fullName`s to
 * create and which to delete so that re-saving the same selection is a no-op
 * (idempotent — no spurious writes).
 */

export interface RepositoryReconciliation {
  /** `fullName`s present in desired but not current — rows to create. */
  toCreate: string[];
  /** `fullName`s present in current but not desired — rows to delete. */
  toDelete: string[];
}

export function reconcileWorkspaceRepositories(
  currentFullNames: readonly string[],
  desiredFullNames: readonly string[],
): RepositoryReconciliation {
  const current = new Set(currentFullNames);
  const desired = new Set(desiredFullNames);

  const toCreate = [...desired].filter((fullName) => !current.has(fullName));
  const toDelete = [...current].filter((fullName) => !desired.has(fullName));

  return { toCreate, toDelete };
}
