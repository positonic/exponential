import { Octokit } from "@octokit/rest";
import { type PrismaClient } from "@prisma/client";

import { initGithubClient, parseRepoInfo } from "../../githubService";
import { parseCadence, periodWindow } from "../scheduling/scheduleResolver";
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
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const branch = (input.branch as string) ?? "main";
    const { since, until } = resolveCommitWindow(input, config, new Date());

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
    // Defensive bound: cap pagination so a very active repo (or a wide window)
    // can't fan out into thousands of API calls / a huge LLM payload downstream.
    const maxPages = 10;

    while (page <= maxPages) {
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
}

/**
 * Which commits a run covers. In precedence order:
 * 1. An explicit `input.since` (content workflow, product-timeline).
 * 2. A scheduled run — the engine passes `scheduledFor` and the definition's
 *    `schedule` — covers exactly the period that just ended
 *    (`periodWindow`), so consecutive Broadcast sends tile with no repeats.
 * 3. A trailing `dayRange` window from the input (test send) or the step's own
 *    config, defaulting to 7 days.
 *
 * Step config is read here as well as input: the engine passes a step's config
 * as the separate `config` argument, so a `dayRange` stored there was
 * previously ignored and every Broadcast fell back to 7 days.
 */
export function resolveCommitWindow(
  input: Record<string, unknown>,
  config: Record<string, unknown>,
  now: Date,
): { since: string; until: string } {
  const until =
    typeof input.until === "string" ? input.until : now.toISOString();
  if (typeof input.since === "string") return { since: input.since, until };

  const cadence = parseCadence(input);
  if (typeof input.scheduledFor === "string" && cadence) {
    const window = periodWindow(cadence, new Date(input.scheduledFor));
    return {
      since: window.since.toISOString(),
      until: window.until.toISOString(),
    };
  }

  const dayRange =
    typeof input.dayRange === "number"
      ? input.dayRange
      : typeof config.dayRange === "number"
        ? config.dayRange
        : 7;
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - dayRange);
  return { since: since.toISOString(), until };
}
