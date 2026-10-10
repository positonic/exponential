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
  /**
   * GitHub's review node id. Required for a unique per-review feed key: one PR
   * collects many reviews and the backfill dedups on `(entityType, entityId)`.
   * The live path reads it off `review.node_id`; the backfill off the stored
   * `GitHubActivity.externalId`, which is the same value.
   */
  prReviewId?: string | null;

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

/** Length GitHub itself uses for abbreviated commit shas in UI and metadata. */
const SHORT_SHA_LENGTH = 7;

/**
 * Canonical commit sha for keys and metadata: trimmed and lower-cased. Returns
 * `null` for blank input so callers can fall through to a non-sha key.
 */
export function normalizeCommitSha(
  sha: string | null | undefined,
): string | null {
  const trimmed = sha?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Abbreviated sha for display (`metadata.commitSha`). */
export function shortCommitSha(sha: string | null | undefined): string | null {
  const normalized = normalizeCommitSha(sha);
  return normalized ? normalized.slice(0, SHORT_SHA_LENGTH) : null;
}

/**
 * Feed key for a push. The live webhook path and the backfill script MUST build
 * this through the same function — they hold different sha spellings (webhook
 * gives the full 40-char id, `GitHubActivity.commitSha` stores an abbreviated
 * one) and a mismatch would make the backfill re-insert every push the webhook
 * already recorded. Callers pass the *full* sha whenever they have it.
 *
 * Note that nothing in the schema enforces uniqueness on `(entityType,
 * entityId)`; the write sites check for an existing row themselves.
 */
export function pushEntityId(input: {
  repoFullName: string;
  branchName?: string | null;
  headCommitSha?: string | null;
}): string {
  const sha = normalizeCommitSha(input.headCommitSha);
  return sha
    ? `${input.repoFullName}@${sha}`
    : `${input.repoFullName}@${input.branchName ?? "unknown"}`;
}

/**
 * Feed key for a submitted review. Includes the review id so each review on a
 * PR is its own row; a bare `repo#pr:review` key would let the backfill's
 * `(entityType, entityId)` filter drop every review after the first. Falls back
 * to the reviewer login when no review id is available, which still separates
 * different reviewers' reviews.
 */
export function reviewEntityId(input: {
  repoFullName: string;
  prNumber: number;
  prReviewId?: string | null;
  prReviewer?: string | null;
}): string {
  const discriminator =
    input.prReviewId?.trim() ?? input.prReviewer?.trim() ?? "unknown";
  return `${input.repoFullName}#${input.prNumber}:review:${discriminator}`;
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
        entityId: reviewEntityId({
          repoFullName: input.repoFullName,
          prNumber: input.prNumber,
          prReviewId: input.prReviewId,
          prReviewer: input.prReviewer,
        }),
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
        // Keyed on the head commit so a redelivered push maps onto the same
        // row. The key alone does not dedup — `WorkspaceActivityEvent` has no
        // unique constraint on it — so `emitFeedEvent` and the backfill look
        // the key up before writing.
        entityId: pushEntityId(input),
        authorLogin: input.commitAuthor ?? null,
        metadata: {
          title: headline,
          repoFullName: input.repoFullName,
          repoUrl: input.repoUrl ?? null,
          branchName: branch,
          commitCount,
          commitSha: shortCommitSha(input.headCommitSha),
          commitUrl: input.headCommitUrl ?? null,
          author: input.commitAuthor ?? null,
        },
      };
    }

    default:
      return null;
  }
}
