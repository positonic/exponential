import { Octokit } from "@octokit/rest";
import { type PrismaClient } from "@prisma/client";

import { initGithubClient, parseRepoInfo } from "../../githubService";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  /** Owner/name of the repo this commit came from (set for multi-repo runs). */
  repo?: string;
}

interface RepoTarget {
  owner: string;
  repo: string;
}

/**
 * `fetch_github_commits` — fetches commits via the GitHub REST API.
 *
 * Two source modes:
 * - **Explicit repo** (`input.owner`/`input.repo`) — used by the content
 *   workflow and the product-timeline; unchanged behaviour.
 * - **Workspace repo set** — when no explicit repo is given, fetch across the
 *   workspace's declared `WorkspaceRepository` rows. This is what a "What
 *   Shipped Today" Broadcast uses, so the digest reflects the workspace's own
 *   product (CONTEXT.md → What Shipped Today).
 *
 * v1 authenticates with `GITHUB_TOKEN` (or anonymous for public repos). Using a
 * per-repo App-installation token for private workspace repos is a follow-up.
 */
export class FetchGitHubCommitsStep implements IStepExecutor {
  type = "fetch_github_commits";
  label = "Fetch commits from GitHub";

  constructor(private db: PrismaClient) {}

  async execute(
    input: Record<string, unknown>,
    _config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const branch = (input.branch as string) ?? "main";
    const since = this.resolveSinceDate(input);
    const until = (input.until as string) ?? new Date().toISOString();

    const githubToken = process.env.GITHUB_TOKEN;
    const octokit = githubToken ? initGithubClient(githubToken) : new Octokit();

    const targets = await this.resolveTargets(input, context);

    const allCommits: GitHubCommit[] = [];
    for (const target of targets) {
      const { repoOwner, repoName } = parseRepoInfo(target.owner, target.repo);
      const commits = await this.fetchRepoCommits(
        octokit,
        repoOwner,
        repoName,
        branch,
        since,
        until,
      );
      allCommits.push(...commits);
    }

    return {
      commits: allCommits,
      commitCount: allCommits.length,
      repos: targets.map((t) => `${t.owner}/${t.repo}`),
      branch,
      since,
      until,
    };
  }

  /**
   * Explicit `owner`/`repo` wins (content workflow / timeline). Otherwise fall
   * back to the workspace's declared repositories (Broadcast).
   */
  private async resolveTargets(
    input: Record<string, unknown>,
    context: StepContext,
  ): Promise<RepoTarget[]> {
    if (typeof input.owner === "string" && typeof input.repo === "string") {
      return [{ owner: input.owner, repo: input.repo }];
    }
    if (context.workspaceId) {
      const repos = await this.db.workspaceRepository.findMany({
        where: { workspaceId: context.workspaceId },
        select: { owner: true, name: true },
      });
      return repos.map((r) => ({ owner: r.owner, repo: r.name }));
    }
    return [];
  }

  private async fetchRepoCommits(
    octokit: Octokit,
    repoOwner: string,
    repoName: string,
    branch: string,
    since: string,
    until: string,
  ): Promise<GitHubCommit[]> {
    const commits: GitHubCommit[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await octokit.repos.listCommits({
        owner: repoOwner,
        repo: repoName,
        sha: branch,
        since,
        until,
        per_page: perPage,
        page,
      });

      for (const c of response.data) {
        commits.push({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split("\n")[0] ?? c.commit.message,
          author: c.commit.author?.name ?? c.author?.login ?? "unknown",
          date: c.commit.author?.date ?? "",
          url: c.html_url,
          repo: `${repoOwner}/${repoName}`,
        });
      }

      if (response.data.length < perPage) break;
      page++;
    }

    return commits;
  }

  private resolveSinceDate(input: Record<string, unknown>): string {
    if (input.since) return input.since as string;

    const dayRange = (input.dayRange as number) ?? 7;
    const since = new Date();
    since.setDate(since.getDate() - dayRange);
    return since.toISOString();
  }
}
