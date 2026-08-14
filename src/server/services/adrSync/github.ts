import { App } from "octokit";

/**
 * adrSync/github — the thin GitHub surface the sync engine needs, behind an
 * interface so tests drive the engine with a plain fake (same rationale as
 * ticketSync's remote adapter).
 *
 * Auth follows the ADR-0020 pattern exactly: the workspace's single GitHub App
 * installation `Integration` row carries `providerConfig.installationId`, and
 * we mint an installation Octokit per run via `app.getInstallationOctokit`.
 */

export interface AdrTreeEntry {
  /** Path relative to the tree the listing was taken from. */
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface AdrRemote {
  /** Default-branch head: commit SHA and its root tree SHA. */
  getHead(
    owner: string,
    repo: string,
  ): Promise<{ commitSha: string; treeSha: string }>;
  /** List a tree's entries. With `recursive`, paths are slash-joined. */
  getTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive?: boolean,
  ): Promise<AdrTreeEntry[]>;
  /** Fetch one blob's content, decoded to UTF-8. */
  getBlob(owner: string, repo: string, blobSha: string): Promise<string>;
}

export type AdrRemoteFactory = (
  installationId: number,
) => Promise<AdrRemote>;

export function isGithubAppEnvConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY);
}

/** Real implementation over an installation Octokit. */
export const createInstallationAdrRemote: AdrRemoteFactory = async (
  installationId,
) => {
  if (!isGithubAppEnvConfigured()) {
    throw new Error("GitHub App environment is not configured");
  }
  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_PRIVATE_KEY!,
  });
  const octokit = await app.getInstallationOctokit(installationId);

  return {
    async getHead(owner, repo) {
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
      const branch = repoData.default_branch;
      const { data: commit } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      return { commitSha: commit.sha, treeSha: commit.commit.tree.sha };
    },
    async getTree(owner, repo, treeSha, recursive) {
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        ...(recursive ? { recursive: "true" } : {}),
      });
      return (data.tree ?? [])
        .filter(
          (e): e is typeof e & { path: string; sha: string } =>
            typeof e.path === "string" &&
            typeof e.sha === "string" &&
            (e.type === "blob" || e.type === "tree"),
        )
        .map((e) => ({
          path: e.path,
          type: e.type as "blob" | "tree",
          sha: e.sha,
        }));
    },
    async getBlob(owner, repo, blobSha) {
      const { data } = await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: blobSha,
      });
      return Buffer.from(data.content, "base64").toString("utf8");
    },
  };
};

/** Read the numeric installation id off an Integration's providerConfig. */
export function readInstallationId(
  providerConfig: unknown,
): number | null {
  if (!providerConfig || typeof providerConfig !== "object") return null;
  const raw = (providerConfig as Record<string, unknown>).installationId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}
