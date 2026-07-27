/**
 * Stale-write guard — the pure optimistic-concurrency decision for the
 * single-writer PRD body (ADR-0024 §6).
 *
 * Each save carries the `docVersion` the client loaded (`baseVersion`). The
 * server compares it against the version currently stored:
 *
 *  - **match** (`stored === base`) → accept; the write bumps the version.
 *  - **stored is newer** (`stored > base`) → reject as stale: someone else saved
 *    while this tab was open. The client is told to reload rather than clobber
 *    the newer save.
 *  - **stored is older** (`stored < base`) → reject as invalid: the client
 *    claims a version that was never persisted (shouldn't happen).
 *
 * Pure and side-effect free so it can be unit-tested in isolation and reused on
 * both sides of the wire.
 */
export type StaleWriteDecision =
  | { accept: true; nextVersion: number }
  | { accept: false; reason: "stale" | "invalid" };

export function checkStaleWrite(params: {
  storedVersion: number;
  baseVersion: number;
}): StaleWriteDecision {
  const { storedVersion, baseVersion } = params;

  if (
    !Number.isInteger(storedVersion) ||
    !Number.isInteger(baseVersion) ||
    storedVersion < 0 ||
    baseVersion < 0
  ) {
    return { accept: false, reason: "invalid" };
  }

  if (storedVersion === baseVersion) {
    return { accept: true, nextVersion: baseVersion + 1 };
  }

  // stored > base: a newer save landed → stale. stored < base: impossible base.
  return {
    accept: false,
    reason: storedVersion > baseVersion ? "stale" : "invalid",
  };
}
