/**
 * GitHub repo connection state — the pure, app-agnostic core (ADR-0020).
 *
 * Two deep modules live here:
 *  - `isGithubAppConfigured()` (L1): is the GitHub App registered in this
 *    environment? Pure read of env vars, no I/O.
 *  - `resolveGithubConnectionState()`: the single mapping from
 *    (app configured? installed? how many repos?) → a connection-state enum.
 *
 * Both are dependency-free so they unit-test trivially and can be reused by the
 * homepage Connect CTA and the `/integrations` GitHub card without dragging in
 * Prisma or tRPC.
 */

/** Env vars that must all be present for the GitHub App to be usable (L1). */
export const GITHUB_APP_ENV_KEYS = [
  "GITHUB_APP_ID",
  "GITHUB_PRIVATE_KEY",
  "GITHUB_APP_SLUG",
  "GITHUB_WEBHOOK_SECRET",
] as const;

/**
 * Provider/type identifying a workspace's single GitHub App installation
 * `Integration` row. Slice #2 (connect flow) creates the row with exactly these
 * values; slice #1 reads them to detect "installed". Centralised here so both
 * slices share one contract.
 */
export const GITHUB_INSTALLATION_PROVIDER = "github";
export const GITHUB_INSTALLATION_TYPE = "github_app_installation";

/**
 * How connected a workspace is to GitHub. Drives both the homepage CTA and the
 * `/integrations` card.
 *  - `NOT_CONFIGURED` — the GitHub App isn't registered in this environment (L1
 *    missing). Short-circuits everything below.
 *  - `NOT_INSTALLED` — App configured, but this workspace has no installation.
 *  - `NO_REPOS` — installed, but no repos associated yet.
 *  - `CONNECTED` — installed and tracking at least one repo.
 */
export type GithubConnectionState =
  | "NOT_CONFIGURED"
  | "NOT_INSTALLED"
  | "NO_REPOS"
  | "CONNECTED";

/**
 * True only when every required GitHub App env var is present and non-blank.
 * Defaults to `process.env` but accepts an explicit source for testing.
 */
export function isGithubAppConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return GITHUB_APP_ENV_KEYS.every((key) => {
    const value = source[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** Minimal shape of an installation `Integration` — only presence matters here. */
export interface InstallationRef {
  id: string;
}

export interface ResolveGithubConnectionStateInput {
  /** Result of `isGithubAppConfigured()` (L1). */
  appConfigured: boolean;
  /** The workspace's installation `Integration`, or `null` if none (L2). */
  installation: InstallationRef | null;
  /** Count of `WorkspaceRepository` rows for the workspace (L3). */
  repoCount: number;
}

/**
 * The single source-of-truth mapping. Layers short-circuit top-down: an
 * unconfigured App never looks at installation or repo count.
 */
export function resolveGithubConnectionState({
  appConfigured,
  installation,
  repoCount,
}: ResolveGithubConnectionStateInput): GithubConnectionState {
  if (!appConfigured) return "NOT_CONFIGURED";
  if (installation == null) return "NOT_INSTALLED";
  if (repoCount <= 0) return "NO_REPOS";
  return "CONNECTED";
}
