import { type PrismaClient } from "@prisma/client";
import { db } from "~/server/db";

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
 * Attempts to map an activity to an action via issue references in commit messages.
 * Looks for patterns like: fixes #123, closes #456, refs #789
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
        eventTimestamp: new Date(),
        actionId: mapping?.actionId ?? null,
        mappingMethod: mapping?.method ?? null,
        mappingConfidence: mapping?.confidence ?? null,
      },
    });

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

    console.log(
      `[GitHubActivity] Stored PR review (${review.state}) for #${pr.number} from ${repoFullName}`,
    );
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
