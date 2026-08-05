/**
 * Maps a GitHub webhook event onto the `WorkspaceActivityEvent` shape the
 * workspace activity feed reads.
 *
 * Why a mapping and not a read-side union: `GitHubActivity` keeps its own table
 * because it passes ADR-0001's test — a distinct shape *and* a second consumer
 * (`SprintAnalyticsService`). ADR-0023 settled how such a table reaches the
 * shared surfaces: it appends one `WorkspaceActivityEvent` alongside its own
 * row, exactly as channel summaries do, so the aggregated feed, the heatmap and
 * the weekly digest light up for free and pagination stays on a single table.
 * The **Activity source** chip stays derived read-side from `entityType`
 * (`deriveActivitySource`) — never a new column.
 *
 * ## Feed altitude
 *
 * Not every webhook earns a feed row. Following ADR-0042 (one `synced` event per
 * sync run, not one per ticket), this module is the single place that decides
 * what is signal:
 *
 *   - **A push is one row, not one per commit.** `GitHubActivity` stores a row
 *     per commit for analytics; the feed gets a single event carrying the commit
 *     count. A 20-commit merge push should not evict the rest of the day.
 *   - **Only meaningful PR transitions.** `opened`, `merged` and `closed` are
 *     signal. `synchronize`, `edited`, `labeled`, `ready_for_review` and friends
 *     are the churn of an open PR and are suppressed — they return `null`.
 *   - **Reviews only when submitted**, not on edit/dismiss.
 *
 * Returning `null` means "recorded in GitHubActivity, deliberately absent from
 * the feed" — it is not an error.
 */

import type { Prisma } from "@prisma/client";
import type { ActivityAction } from "./recordActivity";

/** Entity types this module emits. All share the `github` source prefix. */
export type GitHubEntityType =
  | "github_push"
  | "github_pull_request"
  | "github_pull_request_review";

/** The subset of a GitHub webhook payload the feed cares about. */
export interface GitHubFeedInput {
  eventType: "push" | "pull_request" | "pull_request_review";
  /** GitHub's `action` field — `opened`, `closed`, `submitted`, … */
  eventAction?: string | null;
  repoFullName: string;
  repoUrl?: string | null;
  branchName?: string | null;

  /** Pull-request fields. */
  prNumber?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  prAuthor?: string | null;
  /** True when this `closed` event actually merged the PR. */
  prMerged?: boolean;
  prReviewState?: string | null;
  prReviewer?: string | null;

  /** Push fields. A push event summarizes its whole commit list. */
  commitCount?: number;
  headCommitSha?: string | null;
  headCommitMessage?: string | null;
  headCommitUrl?: string | null;
  commitAuthor?: string | null;
}

export interface GitHubFeedEvent {
  entityType: GitHubEntityType;
  action: ActivityAction;
  /** Stable id for the underlying GitHub object (PR node id, commit sha, …). */
  entityId: string;
  /**
   * Feed metadata. `title` is what `describeEntityRef` renders as `{entityRef}`;
   * the rest drives the bespoke GitHub row (deep link, author chip, counts).
   */
  metadata: Prisma.InputJsonValue;
  /**
   * GitHub login of whoever caused the event, for actor attribution. Resolved to
   * a real `User` by the caller via `IntegrationUserMapping` when a mapping
   * exists; otherwise the feed renders the login itself.
   */
  authorLogin: string | null;
}

/** PR actions that earn a feed row, and the activity action each maps to. */
function pullRequestAction(
  input: GitHubFeedInput,
): ActivityAction | null {
  switch (input.eventAction) {
    case "opened":
    case "reopened":
      return "created";
    case "closed":
      // The single highest-signal event in the whole stream: work shipped.
      // An unmerged close is a decision, not a shipment — hence the split.
      return input.prMerged ? "completed" : "status_changed";
    default:
      return null;
  }
}

/**
 * Build the feed event for one GitHub webhook, or `null` when the event is
 * deliberately below the feed's altitude (see the module docblock).
 */
export function toGitHubFeedEvent(
  input: GitHubFeedInput,
): GitHubFeedEvent | null {
  switch (input.eventType) {
    case "pull_request": {
      const action = pullRequestAction(input);
      if (!action) return null;
      if (input.prNumber == null) return null;

      return {
        entityType: "github_pull_request",
        action,
        entityId: `${input.repoFullName}#${input.prNumber}`,
        authorLogin: input.prAuthor ?? null,
        metadata: {
          title: input.prTitle ?? `PR #${input.prNumber}`,
          repoFullName: input.repoFullName,
          repoUrl: input.repoUrl ?? null,
          branchName: input.branchName ?? null,
          prNumber: input.prNumber,
          prUrl: input.prUrl ?? null,
          author: input.prAuthor ?? null,
          merged: input.prMerged ?? false,
        },
      };
    }

    case "pull_request_review": {
      if (input.eventAction !== "submitted") return null;
      if (input.prNumber == null) return null;

      return {
        entityType: "github_pull_request_review",
        action: "commented",
        entityId: `${input.repoFullName}#${input.prNumber}:review`,
        authorLogin: input.prReviewer ?? null,
        metadata: {
          title: input.prTitle ?? `PR #${input.prNumber}`,
          repoFullName: input.repoFullName,
          repoUrl: input.repoUrl ?? null,
          prNumber: input.prNumber,
          prUrl: input.prUrl ?? null,
          author: input.prReviewer ?? null,
          reviewState: input.prReviewState ?? null,
        },
      };
    }

    case "push": {
      const commitCount = input.commitCount ?? 0;
      // Branch creates/deletes arrive as pushes with no commits. Nothing shipped.
      if (commitCount === 0) return null;

      const branch = input.branchName ?? "unknown";
      const headline =
        input.headCommitMessage ??
        `${commitCount} commit${commitCount === 1 ? "" : "s"}`;

      return {
        entityType: "github_push",
        action: "created",
        // Keyed on the head commit so a redelivered push dedups naturally.
        entityId: input.headCommitSha ?? `${input.repoFullName}@${branch}`,
        authorLogin: input.commitAuthor ?? null,
        metadata: {
          title: headline,
          repoFullName: input.repoFullName,
          repoUrl: input.repoUrl ?? null,
          branchName: branch,
          commitCount,
          commitSha: input.headCommitSha ?? null,
          commitUrl: input.headCommitUrl ?? null,
          author: input.commitAuthor ?? null,
        },
      };
    }

    default:
      return null;
  }
}
