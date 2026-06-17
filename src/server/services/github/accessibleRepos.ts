/**
 * Normalize the GitHub "repos accessible to an installation" payload into the
 * minimal `RepoOption` shape the connect/associate UI offers for selection
 * (ADR-0020, slice #2).
 *
 * Pure and defensive: the input is whatever GitHub's
 * `apps.listReposAccessibleToInstallation` returned (or a stored copy of it),
 * so it tolerates the `{ repositories: [...] }` envelope, a bare array, and
 * malformed/empty input without throwing. Entries missing the fields we need
 * are dropped rather than surfaced as half-populated options.
 */

export interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extract the repository array from either `{ repositories: [...] }` or `[...]`. */
function extractRepoList(apiResponse: unknown): unknown[] {
  if (Array.isArray(apiResponse)) return apiResponse;
  if (isRecord(apiResponse) && Array.isArray(apiResponse.repositories)) {
    return apiResponse.repositories;
  }
  return [];
}

/** Owner login, preferring `owner.login`, falling back to the `full_name` prefix. */
function resolveOwner(repo: Record<string, unknown>): string | null {
  if (isRecord(repo.owner) && typeof repo.owner.login === "string") {
    return repo.owner.login;
  }
  if (typeof repo.full_name === "string" && repo.full_name.includes("/")) {
    return repo.full_name.split("/")[0] ?? null;
  }
  return null;
}

export function normalizeAccessibleRepos(apiResponse: unknown): RepoOption[] {
  const list = extractRepoList(apiResponse);
  const options: RepoOption[] = [];

  for (const entry of list) {
    if (!isRecord(entry)) continue;

    const name = typeof entry.name === "string" ? entry.name : null;
    const owner = resolveOwner(entry);
    if (!name || !owner) continue;

    const fullName =
      typeof entry.full_name === "string" && entry.full_name.length > 0
        ? entry.full_name
        : `${owner}/${name}`;

    options.push({
      owner,
      name,
      fullName,
      private: entry.private === true,
    });
  }

  return options;
}
