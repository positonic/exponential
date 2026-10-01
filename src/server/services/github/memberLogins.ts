/**
 * Workspace member ↔ GitHub login mapping.
 *
 * `GitHubActivity` records authors as GitHub logins (`prAuthor`,
 * `commitAuthor`), never as Exponential users. The only honest link between
 * the two is the `githubUsername` stored in the `github_metadata` credential
 * on a member's OWN GitHub integration — a member who hasn't connected GitHub
 * has no login, and their PRs/commits stay unattributed rather than guessed.
 */
import type { PrismaClient } from "@prisma/client";

/** Read `githubUsername` out of a `github_metadata` credential blob. */
export function parseGithubUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { githubUsername?: unknown };
    return typeof parsed.githubUsername === "string" && parsed.githubUsername.length > 0
      ? parsed.githubUsername
      : null;
  } catch {
    // An unreadable metadata blob means "no known login", not an error.
    return null;
  }
}

/**
 * GitHub login per user, for the given users' own GitHub integrations in this
 * workspace. Users without one are absent from the map. When a user has
 * several integrations, the most recently updated wins (as `resolveGithubLogin`).
 */
export async function resolveGithubLogins(
  db: Pick<PrismaClient, "integration">,
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const logins = new Map<string, string>();
  if (userIds.length === 0) return logins;

  const integrations = await db.integration.findMany({
    where: { workspaceId, provider: "github", userId: { in: userIds } },
    orderBy: { updatedAt: "desc" },
    select: {
      userId: true,
      credentials: { where: { keyType: "github_metadata" }, select: { key: true }, take: 1 },
    },
  });

  for (const integration of integrations) {
    if (!integration.userId || logins.has(integration.userId)) continue;
    const login = parseGithubUsername(integration.credentials[0]?.key);
    if (login) logins.set(integration.userId, login);
  }
  return logins;
}
