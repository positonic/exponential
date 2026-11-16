/**
 * Repository full names ("owner/repo") from a set of `github_metadata`
 * credential keys, de-duplicated, skipping any key that has none.
 *
 * Only per-repo connections store `repository`; workspace-level App
 * installations (`upsertWorkspaceInstallation`) store user/installation fields
 * only. Reading `metadata.repository.fullName` blindly threw
 * `Cannot read properties of undefined (reading 'fullName')` in
 * `integration.listGithubRepositories` (Sentry EXPONENTIAL-FRONTEND-K).
 */
export function repositoryFullNamesFromMetadata(keys: string[]): string[] {
  const names = new Set<string>();
  for (const key of keys) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(key);
    } catch {
      continue;
    }
    const repository =
      typeof metadata === "object" && metadata !== null
        ? (metadata as { repository?: unknown }).repository
        : undefined;
    const fullName =
      typeof repository === "object" && repository !== null
        ? (repository as { fullName?: unknown }).fullName
        : undefined;
    if (typeof fullName === "string" && fullName.length > 0) {
      names.add(fullName);
    }
  }
  return [...names];
}
