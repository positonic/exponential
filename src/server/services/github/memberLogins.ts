/**
 * Workspace member ↔ GitHub login mapping.
 *
 * `GitHubActivity` records authors as GitHub logins (`prAuthor`,
 * `commitAuthor`), never as Exponential users. The only honest link between
 * the two is the user's **GitHub identity claim** (`User.githubLogin`, set by
 * the OAuth link flow — see `identityClaim.ts`). A member without a claim has
 * no login, and their PRs/commits stay unattributed rather than guessed.
 */
import type { PrismaClient } from "@prisma/client";

/**
 * GitHub login per user, for the given users' identity claims. Users who
 * haven't linked GitHub are absent from the map.
 */
export async function resolveGithubLogins(
  db: Pick<PrismaClient, "user">,
  userIds: string[],
): Promise<Map<string, string>> {
  const logins = new Map<string, string>();
  if (userIds.length === 0) return logins;

  const users = await db.user.findMany({
    where: { id: { in: userIds }, githubLogin: { not: null } },
    select: { id: true, githubLogin: true },
  });
  for (const user of users) {
    if (user.githubLogin) logins.set(user.id, user.githubLogin);
  }
  return logins;
}
