/**
 * One structured conflict shape for every compare-and-set write (Agent
 * principles PRD, Phase 3 item 3; ADR-0071 change integrity).
 *
 * A write that carries the revision its caller read is checked against the
 * stored revision. On a mismatch the record is left unchanged (the write is a
 * compare-and-set in `WHERE`) and the caller gets a `RevisionConflictError`.
 * Routers surface it as `TRPCError({ code: "CONFLICT", cause })`, and the tRPC
 * `errorFormatter` exposes `error.cause.conflict` as `data.conflict`, next to
 * `data.zodError`. Clients re-read and reconcile; none retries automatically.
 */

import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { checkStaleWrite } from "~/lib/prd/stale-write";

export type RevisionEntity =
  | "page"
  | "feature"
  | "ticket"
  | "action"
  | "decision"
  | "project";

export interface RevisionConflict {
  kind: "revision_conflict";
  entity: RevisionEntity;
  id: string;
  /** Set for field-level checks, e.g. `"body"` on a document's `docVersion`. */
  field?: string;
  expectedRevision: number;
  currentRevision: number;
}

export const REVISION_CONFLICT_MESSAGE =
  "The record changed since you read it. Re-read it and reconcile; do not retry with the old revision.";

export class RevisionConflictError extends Error {
  readonly conflict: RevisionConflict;

  constructor(
    conflict: Omit<RevisionConflict, "kind">,
    message: string = REVISION_CONFLICT_MESSAGE,
  ) {
    super(message);
    this.name = "RevisionConflictError";
    this.conflict = { kind: "revision_conflict", ...conflict };
  }
}

/**
 * Check a caller's base revision against the stored one. Returns the revision
 * the write will produce; throws a `RevisionConflictError` (carrying both
 * revisions) when they differ. The caller still makes the write a
 * compare-and-set so a save landing between this check and the write is
 * caught too.
 */
export function assertBaseRevision(args: {
  entity: RevisionEntity;
  id: string;
  field?: string;
  storedRevision: number;
  baseRevision: number;
  message?: string;
}): number {
  const decision = checkStaleWrite({
    storedVersion: args.storedRevision,
    baseVersion: args.baseRevision,
  });
  if (decision.accept) return decision.nextVersion;
  throw new RevisionConflictError(
    {
      entity: args.entity,
      id: args.id,
      ...(args.field ? { field: args.field } : {}),
      expectedRevision: args.baseRevision,
      currentRevision: args.storedRevision,
    },
    args.message,
  );
}

/** Map a conflict to the tRPC error routers throw: CONFLICT, conflict as cause. */
export function toConflictTRPCError(error: RevisionConflictError): TRPCError {
  return new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
}

/**
 * Run a service step and rethrow a `RevisionConflictError` as the router's
 * CONFLICT. Any other error passes through untouched.
 */
export async function withConflictAsTRPC<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RevisionConflictError) throw toConflictTRPCError(error);
    throw error;
  }
}

/** The structured conflict on an error's cause, for the tRPC `errorFormatter`. */
export function conflictFromError(error: unknown): RevisionConflict | null {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof RevisionConflictError) return cause.conflict;
  if (error instanceof RevisionConflictError) return error.conflict;
  return null;
}

/**
 * True when a Prisma `update` whose `where` pins the revision found no row:
 * either another write moved the revision on, or the row is gone. The caller
 * re-reads to tell the two apart.
 */
export function isCompareAndSetMiss(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
