import { type PrismaClient } from "@prisma/client";
import { db } from "~/server/db";
import { recordActivity } from "./activity/recordActivity";
import {
  toGitHubFeedEvent,
  type GitHubFeedInput,
} from "./activity/githubFeedEvent";

interface PushEventCommit {
  id: string;
  message: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
}

interface PushEventData {
  ref: string;
  commits: PushEventCommit[];
  repository: {
    full_name: string;
    html_url: string;
  };
  sender: {
    login: string;
  };
}

interface PullRequestEventData {
  action: string;
  pull_request: {
    number: number;
    title: string;
    state: string;
    html_url: string;
    created_at: string;
    merged_at: string | null;
    user: {
      login: string;
    };
    head: {
      ref: string;
    };
    node_id: string;
  };
  repository: {
    full_name: string;
    html_url: string;
  };
}

interface PullRequestReviewEventData {
  action: string;
  review: {
    state: string;
    user: {
      login: string;
    };
    submitted_at: string;
    node_id: string;
  };
  pull_request: {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: {
      login: string;
    };
    head: {
      ref: string;
    };
    node_id: string;
  };
  repository: {
    full_name: string;
    html_url: string;
  };
}

/**
 * Finds the GitHub integration matching a repository.
 * Returns the first active integration whose github_metadata
 * credential matches the given repoFullName.
 */
async function findIntegrationForRepo(
  prisma: PrismaClient,
  repoFullName: string,
): Promise<{ integrationId: string; workspaceId: string } | null> {
  // Preferred: the workspace GitHub App install (ADR-0020) tracks which repos a
  // workspace follows in the WorkspaceRepository table. This is how repos
  // connected via /settings/integrations are registered — the legacy
  // github_metadata credential below is NOT written by that flow, so without
  // this lookup every PR/push webhook for an App-installed repo was dropped and
  // no GitHubActivity was ever recorded.
  const tracked = await prisma.workspaceRepository.findFirst({
    where: { fullName: repoFullName },
    select: { workspaceId: true, integrationId: true },
  });
  if (tracked) {
    return {
      integrationId: tracked.integrationId,
      workspaceId: tracked.workspaceId,
    };
  }

  // Legacy fallback: per-repo github_metadata credential from the older
  // project-level GitHub integration (issue-sync) flow.
  const integrations = await prisma.integration.findMany({
    where: { provider: "github", status: "ACTIVE" },
    include: {
      credentials: { where: { keyType: "github_metadata" } },
      team: { include: { workspace: true } },
      user: { include: { workspaceMemberships: { include: { workspace: true } } } },
    },
  });

  for (const integration of integrations) {
    const meta = integration.credentials.find((c) => c.keyType === "github_metadata");
    if (!meta) continue;

    try {
      const metadata = JSON.parse(meta.key) as Record<string, unknown>;
      const repo = metadata.repository as Record<string, unknown> | undefined;
      if (repo?.fullName === repoFullName) {
        // Resolve workspace: prefer team workspace, fall back to user's first workspace
        const workspaceId =
          integration.team?.workspaceId ??
          integration.user?.workspaceMemberships[0]?.workspace.id;

        if (workspaceId) {
          return { integrationId: integration.id, workspaceId };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Attempts to map a GitHub activity to an action via branch name.
 * Looks for patterns like: feat/ACTION_CUID-description or fix/cuid123
 */
function extractActionIdFromBranch(branchName: string): string | null {
  if (!branchName) return null;

  // Pattern: any-prefix/CUID-rest or any-prefix/CUID
  // CUIDs are 25 chars, alphanumeric, starting with 'c'
  const cuidPattern = /\/?(c[a-z0-9]{24})(?:-|$)/i;
  const match = branchName.match(cuidPattern);
  return match?.[1] ?? null;
}

/**
 * Extract candidate Exponential Ticket **numbers** referenced by a PR's branch
 * and/or title. Teams commonly encode the ticket number in the branch
 * (`296-fix-…`, `clear-291-…`, `feat/274-…`) or the title (e.g. "(#N)" or
 * "#N/#N"). We match a maximal digit run only when it is delimited on both
 * sides by a non-alphanumeric boundary, so version-ish tokens like `v2`, `A0`,
 * or `60s` are ignored. Callers must still confirm each number is a real Ticket
 * before acting, so over-extraction is harmless.
 */
export function extractTicketNumbers(
  branchName: string | null | undefined,
  title: string | null | undefined,
): number[] {
  const found = new Set<number>();
  const pattern = /(?:^|[^a-zA-Z0-9])(\d{1,6})(?=$|[^a-zA-Z0-9])/g;
  for (const source of [branchName ?? "", title ?? ""]) {
    for (const match of source.matchAll(pattern)) {
      const n = Number.parseInt(match[1]!, 10);
      if (n > 0) found.add(n);
    }
  }
  return [...found];
}

/**
 * Best-effort: link a PR to its Exponential Ticket(s) by number, writing
 * `prUrl` + `branchName` back so the merge-hook (which matches merged-PR-URL →
 * ticket.prUrl) can promote it and the ticket carries its PR for traceability.
 * A number is only acted on when it resolves to exactly one Ticket across the
 * workspace's products (Ticket.number is unique per product, so a single-
 * product workspace like CLEAR is always unambiguous). Never throws.
 */
async function linkPrToTickets(
  prisma: PrismaClient,
  workspaceId: string,
  pr: { number: number; title: string; html_url: string; head: { ref: string } },
): Promise<void> {
  try {
    const numbers = extractTicketNumbers(pr.head.ref, pr.title);
    if (numbers.length === 0) return;

    const products = await prisma.product.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    if (products.length === 0) return;
    const productIds = products.map((p) => p.id);

    for (const number of numbers) {
      const matches = await prisma.ticket.findMany({
        where: { number, productId: { in: productIds } },
        select: { id: true },
      });
      // 0 = not a ticket number here; >1 = ambiguous across products → skip.
      if (matches.length !== 1) continue;

      await prisma.ticket.update({
        where: { id: matches[0]!.id },
        data: { prUrl: pr.html_url, branchName: pr.head.ref },
      });
      console.log(
        `[GitHubActivity] Linked PR #${pr.number} → ticket #${number} (${pr.html_url})`,
      );
    }
  } catch (error) {
    console.error("[GitHubActivity] linkPrToTickets failed (non-fatal):", error);
  }
}

/**
 * Attempts to map an activity to an action via issue references in commit messages.
 * Looks for patterns like: "fixes #<n>", "closes #<n>", "refs #<n>".
 */
function extractIssueNumbersFromMessage(message: string): number[] {
  const pattern = /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|refs?)\s+#(\d+)/gi;
  const numbers: number[] = [];
  let match;
  while ((match = pattern.exec(message)) !== null) {
    numbers.push(parseInt(match[1]!, 10));
  }
  return numbers;
}

export class GitHubActivityService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Process a push event — stores each commit as a GitHubActivity record.
   */
  async processPushEvent(
    data: PushEventData,
    deliveryId: string,
  ): Promise<void> {
    const repoFullName = data.repository.full_name;
    const branchName = data.ref.replace("refs/heads/", "");

    const ctx = await findIntegrationForRepo(this.prisma, repoFullName);
    if (!ctx) {
      console.log(`[GitHubActivity] No integration found for ${repoFullName}, storing skipped`);
      return;
    }

    for (const commit of data.commits) {
      // Deduplicate by commit SHA + eventType
      const existing = await this.prisma.gitHubActivity.findUnique({
        where: {
          externalId_eventType: {
            externalId: commit.id,
            eventType: "push",
          },
        },
      });
      if (existing) continue;

      // Try to map to an action
      const mapping = await this.resolveActionMapping(
        ctx.workspaceId,
        repoFullName,
        branchName,
        commit.message,
      );

      await this.prisma.gitHubActivity.create({
        data: {
          workspaceId: ctx.workspaceId,
          integrationId: ctx.integrationId,
          eventType: "push",
          externalId: commit.id,
          deliveryId,
          commitSha: commit.id.slice(0, 7),
          commitMessage: commit.message.split("\n")[0] ?? commit.message,
          commitAuthor: commit.author.username ?? commit.author.name,
          commitUrl: commit.url,
          branchName,
          repoFullName,
          repoUrl: data.repository.html_url,
          eventTimestamp: new Date(commit.timestamp),
          actionId: mapping?.actionId ?? null,
          mappingMethod: mapping?.method ?? null,
          mappingConfidence: mapping?.confidence ?? null,
        },
      });
    }

    // One feed row for the whole push, not one per commit — the commit-level
    // rows above are for analytics. GitHub orders `commits` oldest-first, so the
    // last entry is the head commit.
    const head = data.commits[data.commits.length - 1];
    await this.emitFeedEvent(
      ctx,
      {
        eventType: "push",
        repoFullName,
        repoUrl: data.repository.html_url,
        branchName,
        commitCount: data.commits.length,
        headCommitSha: head?.id.slice(0, 7) ?? null,
        headCommitMessage: head?.message.split("\n")[0] ?? null,
        headCommitUrl: head?.url ?? null,
        commitAuthor: head?.author.username ?? head?.author.name ?? null,
      },
      head ? new Date(head.timestamp) : new Date(),
    );

    console.log(
      `[GitHubActivity] Stored ${data.commits.length} commits from ${repoFullName}/${branchName}`,
    );
  }

  /**
   * Process a pull_request event.
   */
  async processPullRequestEvent(
    data: PullRequestEventData,
    deliveryId: string,
  ): Promise<void> {
    const repoFullName = data.repository.full_name;
    const pr = data.pull_request;

    const ctx = await findIntegrationForRepo(this.prisma, repoFullName);
    if (!ctx) return;

    // Link the PR back to its Ticket(s) by number (branch/title). Runs before
    // the activity-dedup early-return so re-delivered events still (re)link, and
    // on every action so an opened PR is linked well before it merges.
    await linkPrToTickets(this.prisma, ctx.workspaceId, pr);

    // Use PR node_id + action as unique key
    const externalId = `${pr.node_id}:${data.action}`;

    const existing = await this.prisma.gitHubActivity.findUnique({
      where: {
        externalId_eventType: {
          externalId,
          eventType: "pull_request",
        },
      },
    });
    if (existing) return;

    const branchName = pr.head.ref;
    const mapping = await this.resolveActionMapping(
      ctx.workspaceId,
      repoFullName,
      branchName,
      pr.title,
    );

    await this.prisma.gitHubActivity.create({
      data: {
        workspaceId: ctx.workspaceId,
        integrationId: ctx.integrationId,
        eventType: "pull_request",
        eventAction: data.action,
        externalId,
        deliveryId,
        branchName,
        prNumber: pr.number,
        prTitle: pr.title,
        prState: pr.merged_at ? "merged" : pr.state,
        prUrl: pr.html_url,
        prAuthor: pr.user.login,
        prMergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        repoFullName,
        repoUrl: data.repository.html_url,
        // Use the PR's real timestamps, not webhook-receipt time, so
        // opened→merged turnaround (getPrTurnaround) is measured accurately
        // even if a webhook is delivered late or replayed.
        eventTimestamp:
          data.action === "opened" && pr.created_at
            ? new Date(pr.created_at)
            : pr.merged_at
              ? new Date(pr.merged_at)
              : new Date(),
        actionId: mapping?.actionId ?? null,
        mappingMethod: mapping?.method ?? null,
        mappingConfidence: mapping?.confidence ?? null,
      },
    });

    const merged = Boolean(pr.merged_at);
    await this.emitFeedEvent(
      ctx,
      {
        eventType: "pull_request",
        eventAction: data.action,
        repoFullName,
        repoUrl: data.repository.html_url,
        branchName,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        prAuthor: pr.user.login,
        prMerged: merged,
      },
      // Same reasoning as the GitHubActivity row above: use the PR's own
      // timestamps so a late or replayed delivery doesn't misdate the feed.
      data.action === "opened" && pr.created_at
        ? new Date(pr.created_at)
        : pr.merged_at
          ? new Date(pr.merged_at)
          : new Date(),
    );

    console.log(
      `[GitHubActivity] Stored PR #${pr.number} ${data.action} from ${repoFullName}`,
    );
  }

  /**
   * Process a pull_request_review event.
   */
  async processPullRequestReviewEvent(
    data: PullRequestReviewEventData,
    deliveryId: string,
  ): Promise<void> {
    const repoFullName = data.repository.full_name;
    const review = data.review;
    const pr = data.pull_request;

    const ctx = await findIntegrationForRepo(this.prisma, repoFullName);
    if (!ctx) return;

    const externalId = review.node_id;

    const existing = await this.prisma.gitHubActivity.findUnique({
      where: {
        externalId_eventType: {
          externalId,
          eventType: "pull_request_review",
        },
      },
    });
    if (existing) return;

    const branchName = pr.head.ref;
    const mapping = await this.resolveActionMapping(
      ctx.workspaceId,
      repoFullName,
      branchName,
      pr.title,
    );

    await this.prisma.gitHubActivity.create({
      data: {
        workspaceId: ctx.workspaceId,
        integrationId: ctx.integrationId,
        eventType: "pull_request_review",
        eventAction: data.action,
        externalId,
        deliveryId,
        branchName,
        prNumber: pr.number,
        prTitle: pr.title,
        prState: pr.state,
        prUrl: pr.html_url,
        prAuthor: pr.user.login,
        prReviewState: review.state,
        prReviewer: review.user.login,
        repoFullName,
        repoUrl: data.repository.html_url,
        eventTimestamp: new Date(review.submitted_at),
        actionId: mapping?.actionId ?? null,
        mappingMethod: mapping?.method ?? null,
        mappingConfidence: mapping?.confidence ?? null,
      },
    });

    await this.emitFeedEvent(
      ctx,
      {
        eventType: "pull_request_review",
        eventAction: data.action,
        repoFullName,
        repoUrl: data.repository.html_url,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        prReviewState: review.state,
        prReviewer: review.user.login,
      },
      new Date(review.submitted_at),
    );

    console.log(
      `[GitHubActivity] Stored PR review (${review.state}) for #${pr.number} from ${repoFullName}`,
    );
  }

  /**
   * Append the feed row for a GitHub event, alongside the `GitHubActivity` row
   * that analytics reads. See `githubFeedEvent.ts` for why this is a write-time
   * append rather than a read-side union, and which events are suppressed.
   *
   * Failures are swallowed by `recordActivity` — a feed row is instrumentation,
   * and must never fail the webhook that recorded the underlying activity.
   */
  private async emitFeedEvent(
    ctx: { workspaceId: string; integrationId: string },
    input: GitHubFeedInput,
    occurredAt: Date,
  ): Promise<void> {
    const event = toGitHubFeedEvent(input);
    if (!event) return; // below feed altitude — recorded, deliberately not shown

    await recordActivity(this.prisma, {
      workspaceId: ctx.workspaceId,
      // Attribute to the Exponential user behind the GitHub login when the
      // integration knows the pairing; otherwise leave the actor null and let
      // the feed render the raw login from metadata (ADR-0023 does the same for
      // channels, where the actor is the channel rather than a person).
      userId: await this.resolveUserForLogin(
        ctx.integrationId,
        event.authorLogin,
      ),
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      metadata: event.metadata,
      occurredAt,
    });
  }

  /**
   * Map a GitHub login to an Exponential user via `IntegrationUserMapping`.
   * Returns null when no pairing exists — the common case for outside
   * contributors and bots.
   */
  private async resolveUserForLogin(
    integrationId: string,
    login: string | null,
  ): Promise<string | null> {
    if (!login) return null;
    const mapping = await this.prisma.integrationUserMapping.findUnique({
      where: {
        integrationId_externalUserId: { integrationId, externalUserId: login },
      },
      select: { userId: true },
    });
    return mapping?.userId ?? null;
  }

  /**
   * Resolve action mapping using Tier 1 (explicit) and Tier 2 (branch name) strategies.
   * Returns null if no mapping found.
   */
  private async resolveActionMapping(
    workspaceId: string,
    repoFullName: string,
    branchName: string,
    message: string,
  ): Promise<{ actionId: string; method: string; confidence: number } | null> {
    // Tier 1: Explicit — check if commit references a GitHub issue number
    // that's linked to an action via ActionSync
    const issueNumbers = extractIssueNumbersFromMessage(message);
    for (const issueNum of issueNumbers) {
      const sync = await this.prisma.actionSync.findFirst({
        where: {
          provider: "github",
          externalId: String(issueNum),
        },
        select: { actionId: true },
      });
      if (sync) {
        return { actionId: sync.actionId, method: "explicit", confidence: 1.0 };
      }
    }

    // Tier 2: Branch name — extract CUID from branch name
    const actionId = extractActionIdFromBranch(branchName);
    if (actionId) {
      // Verify the action exists in this workspace
      const action = await this.prisma.action.findFirst({
        where: { id: actionId, workspaceId },
        select: { id: true },
      });
      if (action) {
        return { actionId: action.id, method: "branch", confidence: 0.9 };
      }
    }

    // Tier 3: Semantic matching — deferred to Phase 5
    return null;
  }

  /**
   * Get activity summary since a given date for a workspace.
   */
  async getActivitySummary(
    workspaceId: string,
    since: Date,
  ): Promise<{
    totalCommits: number;
    totalPRsOpened: number;
    totalPRsMerged: number;
    totalReviews: number;
    mappedCount: number;
    unmappedCount: number;
  }> {
    const activities = await this.prisma.gitHubActivity.findMany({
      where: {
        workspaceId,
        eventTimestamp: { gte: since },
      },
      select: {
        eventType: true,
        eventAction: true,
        prState: true,
        actionId: true,
      },
    });

    const totalCommits = activities.filter((a) => a.eventType === "push").length;
    const totalPRsOpened = activities.filter(
      (a) => a.eventType === "pull_request" && a.eventAction === "opened",
    ).length;
    const totalPRsMerged = activities.filter(
      (a) => a.eventType === "pull_request" && a.prState === "merged",
    ).length;
    const totalReviews = activities.filter(
      (a) => a.eventType === "pull_request_review",
    ).length;
    const mappedCount = activities.filter((a) => a.actionId != null).length;
    const unmappedCount = activities.filter((a) => a.actionId == null).length;

    return {
      totalCommits,
      totalPRsOpened,
      totalPRsMerged,
      totalReviews,
      mappedCount,
      unmappedCount,
    };
  }
}

// Export singleton instance
export const githubActivityService = new GitHubActivityService(db);
