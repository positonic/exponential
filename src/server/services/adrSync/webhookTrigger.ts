import type { PrismaClient } from "@prisma/client";
import { runAdrSync } from "./engine";
import type { AdrRemoteFactory } from "./github";

/**
 * adrSync/webhookTrigger — turn a GitHub `push` delivery into an immediate
 * sync run, so a merged ADR lands in the Decision Log within seconds instead
 * of at the next hourly cron tick.
 *
 * Scope guards (the acceptance criteria, verbatim):
 * - only pushes to the repo's DEFAULT branch count;
 * - only pushes whose commits touch an enrolled `adrPaths` dir count;
 * - the existing GitHubActivity processing is upstream and untouched — this
 *   trigger runs after it and its failure must never break that handler.
 *
 * Redelivery safety: the route's delivery pipeline processes each delivery
 * once, and a re-delivered (or overlapping) push is idempotent here anyway —
 * the engine short-circuits on the unchanged tree SHA and records the run as
 * `unchanged` at a cost of ~1 API call, so duplicate triggers cannot do
 * duplicate work.
 */

export interface PushEventLike {
  ref: string;
  repository: { full_name: string; default_branch?: string };
  commits?: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
}

/** Pure: does this push (default branch only) touch any enrolled ADR dir? */
export function pushTouchesAdrPaths(
  push: PushEventLike,
  adrPaths: string[],
): boolean {
  if (!push.ref.startsWith("refs/heads/")) return false;
  const branch = push.ref.slice("refs/heads/".length);
  const defaultBranch = push.repository.default_branch;
  if (!defaultBranch || branch !== defaultBranch) return false;

  const changed = (push.commits ?? []).flatMap((commit) => [
    ...(commit.added ?? []),
    ...(commit.modified ?? []),
    ...(commit.removed ?? []),
  ]);
  return changed.some((file) =>
    adrPaths.some((dir) => {
      const normalized = dir.replace(/^\/+|\/+$/g, "");
      return normalized.length > 0 && file.startsWith(`${normalized}/`);
    }),
  );
}

export async function triggerAdrSyncFromPush(
  db: PrismaClient,
  push: PushEventLike,
  deps?: { remoteFactory?: AdrRemoteFactory; runSync?: typeof runAdrSync },
): Promise<{ triggered: Array<{ configId: string; status: string }> }> {
  const runSync = deps?.runSync ?? runAdrSync;

  // A repo may be tracked by more than one workspace; each enrolment gets
  // its own run. Disconnected configs are never triggered (ADR-0042).
  const configs = await db.adrSyncConfig.findMany({
    where: {
      enabled: true,
      integrationId: { not: null },
      repository: { fullName: push.repository.full_name },
    },
    select: { id: true, adrPaths: true },
  });

  const triggered: Array<{ configId: string; status: string }> = [];
  for (const config of configs) {
    if (!pushTouchesAdrPaths(push, config.adrPaths)) continue;
    try {
      const result = await runSync(db, config.id, "webhook", {
        remoteFactory: deps?.remoteFactory,
      });
      triggered.push({ configId: config.id, status: result.status });
    } catch (error) {
      // One enrolment's failure must not block another workspace's.
      console.error(
        `[AdrSync] webhook trigger failed for config ${config.id}:`,
        error,
      );
      triggered.push({ configId: config.id, status: "error" });
    }
  }
  return { triggered };
}
