/**
 * How a GitHub App install round trip ended, carried back to the workspace it
 * was started from as `?github=<result>` on workspace settings → Integrations.
 *
 * The callback route writes it and the GitHub section reads it, so both sides
 * share this file. The value is a fixed code, never free text: the message a
 * person sees is chosen here, not taken from the URL.
 */
export const GITHUB_INSTALL_PARAM = "github";

const RESULTS = ["connected", "updated", "failed", "forbidden"] as const;

export type GithubInstallResult = (typeof RESULTS)[number];

export function parseGithubInstallResult(
  value: string | null | undefined,
): GithubInstallResult | null {
  return RESULTS.find((result) => result === value) ?? null;
}

/** Workspace settings → Integrations, optionally reporting an install result. */
export function workspaceGithubSettingsPath(
  workspaceSlug: string,
  result?: GithubInstallResult,
): string {
  const query = new URLSearchParams({ section: "integrations" });
  if (result) query.set(GITHUB_INSTALL_PARAM, result);
  return `/w/${encodeURIComponent(workspaceSlug)}/settings?${query.toString()}`;
}

export interface GithubInstallNotice {
  title: string;
  message: string;
  color: "green" | "red";
}

export function githubInstallNotice(
  result: GithubInstallResult,
): GithubInstallNotice {
  switch (result) {
    case "connected":
      return {
        title: "GitHub connected",
        message: "Choose the repositories this workspace should track.",
        color: "green",
      };
    case "updated":
      return {
        title: "GitHub access updated",
        message:
          "The repositories the GitHub App can see have been refreshed.",
        color: "green",
      };
    case "failed":
      return {
        title: "GitHub wasn't connected",
        message:
          "The GitHub App install didn't complete. Try again from this section.",
        color: "red",
      };
    case "forbidden":
      return {
        title: "GitHub wasn't connected",
        message: "Only workspace owners and admins can connect GitHub.",
        color: "red",
      };
  }
}
