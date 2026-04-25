import { Octokit } from "@octokit/rest";
import { initGithubClient, parseRepoInfo } from "../../githubService";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export class FetchGitHubCommitsStep implements IStepExecutor {
  type = "fetch_github_commits";
  label = "Fetch commits from GitHub";

  async execute(
    input: Record<string, unknown>,
    _config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const branch = (input.branch as string) ?? "main";

    const since = this.resolveSinceDate(input);
    const until = (input.until as string) ?? new Date().toISOString();

    const githubToken = process.env.GITHUB_TOKEN;
    const octokit = githubToken
      ? initGithubClient(githubToken)
      : new Octokit();
    const { repoOwner, repoName } = parseRepoInfo(owner, repo);

    const allCommits: GitHubCommit[] = [];
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

      const commits = response.data.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0] ?? c.commit.message,
        author: c.commit.author?.name ?? c.author?.login ?? "unknown",
        date: c.commit.author?.date ?? "",
        url: c.html_url,
      }));

      allCommits.push(...commits);

      if (response.data.length < perPage) break;
      page++;
    }

    return {
      commits: allCommits,
      commitCount: allCommits.length,
      repoOwner,
      repoName,
      branch,
      since,
      until,
    };
  }

  private resolveSinceDate(input: Record<string, unknown>): string {
    if (input.since) return input.since as string;

    const dayRange = (input.dayRange as number) ?? 7;
    const since = new Date();
    since.setDate(since.getDate() - dayRange);
    return since.toISOString();
  }
}
