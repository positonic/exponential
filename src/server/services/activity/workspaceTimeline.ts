/**
 * Workspace shipping timeline — the per-workspace sibling of the public
 * `/product-timeline` page.
 *
 * The public page calls the GitHub API live, hardcoded to `positonic/exponential`,
 * and stores nothing. That is right for a marketing changelog and wrong for a
 * workspace view, which needs to be:
 *
 *   - **Workspace-scoped**, so access control is the workspace membership check
 *     rather than "this repo is public".
 *   - **Multi-repo**, because a workspace's shipping is spread across every repo
 *     it tracks — a timeline showing only one of four under-reports by design.
 *   - **Independent of a live GitHub token.** An expired `GITHUB_TOKEN` should
 *     degrade the public changelog, not blank a page inside the product.
 *
 * So this reads the `GitHubActivity` rows the webhook already stores. The
 * consequence worth stating: the timeline can only show what was ingested. A
 * repo that isn't registered in `WorkspaceRepository` has its webhooks dropped
 * (see `findIntegrationForRepo`), and will silently be missing here — which is
 * why {@link getWorkspaceTimeline} also reports the repos it *does* know about,
 * so the UI can say "these repos" rather than implying completeness.
 */

import type { PrismaClient } from "@prisma/client";

/** One shipped thing: a merged PR, or a push to a branch. */
export interface TimelineItem {
  id: string;
  kind: "pull_request" | "push";
  occurredAt: Date;
  repoFullName: string;
  repoUrl: string | null;
  title: string;
  url: string | null;
  author: string | null;
  branchName: string | null;
  /** PR only. */
  prNumber: number | null;
  /** Push only — commits in that push. */
  commitCount: number | null;
}

export interface WorkspaceTimeline {
  items: TimelineItem[];
  /**
   * Repos this workspace actually tracks. Rendered by the UI so an incomplete
   * timeline reads as "we're watching these three repos" rather than as the
   * whole truth.
   */
  trackedRepos: string[];
  /** True when the workspace tracks no repos at all — nothing can ever appear. */
  isUnconfigured: boolean;
}

/** How far back the timeline reaches by default. */
export const TIMELINE_DEFAULT_DAYS = 30;
const MAX_ITEMS = 500;

/**
 * Read a workspace's shipping timeline. Access is NOT enforced here — the
 * caller resolves membership first, matching the convention in
 * `getAggregatedActivityFeed`.
 *
 * Merged PRs and pushes are both included: a PR merge is the headline, but work
 * pushed straight to a branch (or to `main`) is shipping too, and a workspace
 * whose repos don't use PRs would otherwise see an empty page.
 */
export async function getWorkspaceTimeline(
  db: PrismaClient,
  args: {
    workspaceId: string;
    days?: number;
    /** Restrict to one repo; omit for every repo the workspace tracks. */
    repoFullName?: string;
  },
): Promise<WorkspaceTimeline> {
  const days = args.days ?? TIMELINE_DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [tracked, rows] = await Promise.all([
    db.workspaceRepository.findMany({
      where: { workspaceId: args.workspaceId },
      select: { fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.gitHubActivity.findMany({
      where: {
        workspaceId: args.workspaceId,
        eventTimestamp: { gte: since },
        ...(args.repoFullName ? { repoFullName: args.repoFullName } : {}),
        // Merged PRs and commits only. An opened PR is work in flight, and a
        // review is commentary — neither belongs on a "what shipped" timeline.
        OR: [
          { eventType: "pull_request", prState: "merged" },
          { eventType: "push" },
        ],
      },
      orderBy: { eventTimestamp: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        eventType: true,
        eventTimestamp: true,
        repoFullName: true,
        repoUrl: true,
        branchName: true,
        prNumber: true,
        prTitle: true,
        prUrl: true,
        prAuthor: true,
        commitSha: true,
        commitMessage: true,
        commitUrl: true,
        commitAuthor: true,
      },
    }),
  ]);

  const items: TimelineItem[] = rows.map((row) => {
    if (row.eventType === "pull_request") {
      return {
        id: row.id,
        kind: "pull_request" as const,
        occurredAt: row.eventTimestamp,
        repoFullName: row.repoFullName,
        repoUrl: row.repoUrl,
        title: row.prTitle ?? `PR #${row.prNumber ?? "?"}`,
        url: row.prUrl,
        author: row.prAuthor,
        branchName: row.branchName,
        prNumber: row.prNumber,
        commitCount: null,
      };
    }
    return {
      id: row.id,
      kind: "push" as const,
      occurredAt: row.eventTimestamp,
      repoFullName: row.repoFullName,
      repoUrl: row.repoUrl,
      title: row.commitMessage ?? row.commitSha ?? "commit",
      url: row.commitUrl,
      author: row.commitAuthor,
      branchName: row.branchName,
      prNumber: null,
      // GitHubActivity stores one row per commit, so each push row here IS one
      // commit — the aggregated per-push count lives on the feed event instead.
      commitCount: 1,
    };
  });

  const trackedRepos = tracked.map((t) => t.fullName);

  return {
    items,
    trackedRepos,
    isUnconfigured: trackedRepos.length === 0,
  };
}
