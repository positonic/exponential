/**
 * One-off backfill: emit `WorkspaceActivityEvent` rows for `GitHubActivity`
 * records that were ingested before the feed join existed.
 *
 * The webhook now appends a feed event alongside each `GitHubActivity` row (see
 * `githubFeedEvent.ts`), but every row stored before that shipped is invisible
 * to the activity feed, the heatmap, Week in Review and the workspace timeline.
 * This walks the existing table and fills the gap.
 *
 * Faithful to the live path in two ways that matter:
 *   - **Same altitude rules.** It reuses `toGitHubFeedEvent`, so suppressed
 *     events stay suppressed and a day of `synchronize` churn doesn't get
 *     retro-fitted into the feed.
 *   - **One feed row per push, not per commit.** `GitHubActivity` stores a row
 *     per commit; those are collapsed back into per-(repo, branch, day) pushes
 *     first, matching what the webhook would have written at the time.
 *
 * Idempotent: existing `github*` events are read first and matched on
 * `(entityType, entityId)`, so re-running adds nothing. Backfilled rows carry
 * the original `eventTimestamp` as `createdAt`, so history lands on the day it
 * happened rather than the day the script ran.
 *
 * Usage:
 *   npx tsx scripts/backfill-github-activity-feed.ts                      # dry-run
 *   npx tsx scripts/backfill-github-activity-feed.ts --apply              # write
 *   npx tsx scripts/backfill-github-activity-feed.ts --workspace <id>     # scope
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import {
  toGitHubFeedEvent,
  type GitHubFeedInput,
} from "../src/server/services/activity/githubFeedEvent";
import { GITHUB_ENTITY_PREFIX } from "../src/server/services/activity/deriveActivitySource";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const workspaceArgIndex = process.argv.indexOf("--workspace");
const workspaceId =
  workspaceArgIndex >= 0 ? process.argv[workspaceArgIndex + 1] : undefined;

const BATCH_SIZE = 500;

interface PendingRow {
  workspaceId: string;
  integrationId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Prisma.InputJsonValue;
  createdAt: Date;
  authorLogin: string | null;
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Scope: ${workspaceId ?? "all workspaces"}\n`);

  const activities = await db.gitHubActivity.findMany({
    where: workspaceId ? { workspaceId } : {},
    orderBy: { eventTimestamp: "asc" },
    select: {
      workspaceId: true,
      integrationId: true,
      eventType: true,
      eventAction: true,
      repoFullName: true,
      repoUrl: true,
      branchName: true,
      prNumber: true,
      prTitle: true,
      prUrl: true,
      prAuthor: true,
      prState: true,
      prMergedAt: true,
      prReviewState: true,
      prReviewer: true,
      commitSha: true,
      commitMessage: true,
      commitAuthor: true,
      commitUrl: true,
      eventTimestamp: true,
    },
  });

  console.log(`Read ${activities.length} GitHubActivity rows`);

  // Collapse commit rows into one push per (workspace, repo, branch, day) so the
  // backfill produces the same altitude as the live webhook path.
  const pushBuckets = new Map<string, typeof activities>();
  const nonPush: typeof activities = [];

  for (const row of activities) {
    if (row.eventType !== "push") {
      nonPush.push(row);
      continue;
    }
    const day = row.eventTimestamp.toISOString().slice(0, 10);
    const key = `${row.workspaceId}|${row.repoFullName}|${row.branchName ?? ""}|${day}`;
    const bucket = pushBuckets.get(key);
    if (bucket) bucket.push(row);
    else pushBuckets.set(key, [row]);
  }

  console.log(
    `→ ${nonPush.length} PR/review rows, ${pushBuckets.size} collapsed pushes ` +
      `(from ${activities.length - nonPush.length} commit rows)\n`,
  );

  const pending: PendingRow[] = [];

  for (const row of nonPush) {
    const input: GitHubFeedInput = {
      eventType: row.eventType as GitHubFeedInput["eventType"],
      eventAction: row.eventAction,
      repoFullName: row.repoFullName,
      repoUrl: row.repoUrl,
      branchName: row.branchName,
      prNumber: row.prNumber,
      prTitle: row.prTitle,
      prUrl: row.prUrl,
      prAuthor: row.prAuthor,
      // The stored `prState` is the authority here: `eventAction` was recorded
      // as "closed" for both merges and plain closes.
      prMerged: row.prState === "merged" || row.prMergedAt != null,
      prReviewState: row.prReviewState,
      prReviewer: row.prReviewer,
    };
    const event = toGitHubFeedEvent(input);
    if (!event) continue;
    pending.push({
      workspaceId: row.workspaceId,
      integrationId: row.integrationId,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      metadata: event.metadata,
      createdAt: row.eventTimestamp,
      authorLogin: event.authorLogin,
    });
  }

  for (const bucket of pushBuckets.values()) {
    const head = bucket[bucket.length - 1]!;
    const event = toGitHubFeedEvent({
      eventType: "push",
      repoFullName: head.repoFullName,
      repoUrl: head.repoUrl,
      branchName: head.branchName,
      commitCount: bucket.length,
      headCommitSha: head.commitSha,
      headCommitMessage: head.commitMessage,
      headCommitUrl: head.commitUrl,
      commitAuthor: head.commitAuthor,
    });
    if (!event) continue;
    pending.push({
      workspaceId: head.workspaceId,
      integrationId: head.integrationId,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      metadata: event.metadata,
      createdAt: head.eventTimestamp,
      authorLogin: event.authorLogin,
    });
  }

  // Skip anything already present, so the script is safe to re-run.
  const existing = await db.workspaceActivityEvent.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      entityType: { startsWith: GITHUB_ENTITY_PREFIX },
    },
    select: { entityType: true, entityId: true },
  });
  const seen = new Set(existing.map((e) => `${e.entityType}|${e.entityId}`));
  const fresh = pending.filter(
    (p) => !seen.has(`${p.entityType}|${p.entityId}`),
  );

  console.log(
    `${pending.length} candidate events, ${existing.length} already present, ` +
      `${fresh.length} to insert\n`,
  );

  // Resolve GitHub logins to users once per (integration, login) pair rather
  // than per row — a few thousand commits collapse to a handful of authors.
  const loginPairs = new Set(
    fresh
      .filter((f) => f.authorLogin)
      .map((f) => `${f.integrationId}|${f.authorLogin!}`),
  );
  const userByPair = new Map<string, string>();
  for (const pair of loginPairs) {
    const [integrationId, login] = pair.split("|");
    const mapping = await db.integrationUserMapping.findUnique({
      where: {
        integrationId_externalUserId: {
          integrationId: integrationId!,
          externalUserId: login!,
        },
      },
      select: { userId: true },
    });
    if (mapping) userByPair.set(pair, mapping.userId);
  }
  console.log(
    `Resolved ${userByPair.size}/${loginPairs.size} GitHub logins to users\n`,
  );

  const byType = new Map<string, number>();
  for (const row of fresh) {
    byType.set(row.entityType, (byType.get(row.entityType) ?? 0) + 1);
  }
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);
  console.log();

  if (!apply) {
    console.log("DRY-RUN — nothing written. Re-run with --apply.");
    return;
  }

  let inserted = 0;
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const batch = fresh.slice(i, i + BATCH_SIZE);
    const result = await db.workspaceActivityEvent.createMany({
      data: batch.map((row) => ({
        workspaceId: row.workspaceId,
        userId: row.authorLogin
          ? (userByPair.get(`${row.integrationId}|${row.authorLogin}`) ?? null)
          : null,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
    });
    inserted += result.count;
    console.log(`  inserted ${inserted}/${fresh.length}`);
  }

  console.log(`\nDone. Inserted ${inserted} activity events.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
