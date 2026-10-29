/**
 * Workspace member ↔ GitHub login mapping.
 *
 * `GitHubActivity` records authors as GitHub logins (`prAuthor`,
 * `commitAuthor`), never as Exponential users. Two links between the two are
 * trusted, in this order:
 *  1. `account` — the `githubUsername` in the `github_metadata` credential on
 *     a member's OWN GitHub integration (verified by GitHub sign-in).
 *  2. `workspace` — a username a workspace owner/admin set for the member: an
 *     `IntegrationUserMapping` on the workspace's GitHub App installation, the
 *     same pairing the activity feed attributes events with. Scoped to that
 *     workspace only, because nobody verified it.
 * A member with neither has no login, and their PRs/commits stay unattributed
 * rather than guessed.
 */
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  GITHUB_INSTALLATION_PROVIDER,
  GITHUB_INSTALLATION_TYPE,
} from "~/server/services/github/connectionState";

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

export type GithubLoginSource = "account" | "workspace";

export interface GithubIdentity {
  login: string;
  source: GithubLoginSource;
}

/**
 * GitHub login per user in this workspace, with where it came from (see the
 * module comment for the precedence). Users without one are absent from the
 * map. When a user has several integrations or mappings, the most recently
 * updated wins.
 */
export async function resolveGithubIdentities(
  db: Pick<PrismaClient, "integration" | "integrationUserMapping">,
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, GithubIdentity>> {
  const identities = new Map<string, GithubIdentity>();
  if (userIds.length === 0) return identities;

  const [integrations, mappings] = await Promise.all([
    db.integration.findMany({
      where: { workspaceId, provider: "github", userId: { in: userIds } },
      orderBy: { updatedAt: "desc" },
      select: {
        userId: true,
        credentials: { where: { keyType: "github_metadata" }, select: { key: true }, take: 1 },
      },
    }),
    db.integrationUserMapping.findMany({
      where: {
        userId: { in: userIds },
        integration: installationWhere(workspaceId),
      },
      orderBy: { updatedAt: "desc" },
      select: { userId: true, externalUserId: true },
    }),
  ]);

  for (const integration of integrations) {
    if (!integration.userId || identities.has(integration.userId)) continue;
    const login = parseGithubUsername(integration.credentials[0]?.key);
    if (login) identities.set(integration.userId, { login, source: "account" });
  }
  for (const mapping of mappings) {
    if (identities.has(mapping.userId)) continue;
    identities.set(mapping.userId, { login: mapping.externalUserId, source: "workspace" });
  }
  return identities;
}

/** {@link resolveGithubIdentities}, logins only. */
export async function resolveGithubLogins(
  db: Pick<PrismaClient, "integration" | "integrationUserMapping">,
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const identities = await resolveGithubIdentities(db, workspaceId, userIds);
  return new Map([...identities].map(([userId, { login }]) => [userId, login]));
}

/** The workspace's single GitHub App installation `Integration` (ADR-0020). */
function installationWhere(workspaceId: string) {
  return {
    workspaceId,
    provider: GITHUB_INSTALLATION_PROVIDER,
    type: GITHUB_INSTALLATION_TYPE,
  };
}

// GitHub's own rule: alphanumerics and single inner hyphens, at most 39 chars.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Normalise what an admin typed into a bare login: trims, and accepts
 * `@login` or a `github.com/login` profile URL. Returns null if it isn't a
 * valid GitHub username.
 */
export function normalizeGithubLogin(input: string): string | null {
  const login = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return GITHUB_LOGIN.test(login) ? login : null;
}

/**
 * Set (or with `login: null`, clear) the GitHub username a workspace
 * attributes a member's PRs and commits to. Stored as an
 * `IntegrationUserMapping` on the workspace's GitHub App installation, one per
 * member: setting a login replaces the member's previous one, and a login
 * already given to someone else moves to this member. Callers check the
 * caller's role and the member's membership.
 */
export async function setWorkspaceGithubLogin(
  db: Pick<PrismaClient, "integration" | "integrationUserMapping" | "$transaction">,
  args: { workspaceId: string; userId: string; login: string | null },
): Promise<void> {
  const installation = await db.integration.findFirst({
    where: { ...installationWhere(args.workspaceId), status: "ACTIVE" },
    select: { id: true },
  });
  if (!installation) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Connect GitHub to this workspace before setting usernames.",
    });
  }

  const login = args.login == null ? null : normalizeGithubLogin(args.login);
  if (args.login != null && !login) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${args.login}" isn't a valid GitHub username.`,
    });
  }

  await db.$transaction([
    db.integrationUserMapping.deleteMany({
      where: {
        integrationId: installation.id,
        // The member's old login, and this login wherever it pointed before.
        OR: [{ userId: args.userId }, ...(login
            ? [{ externalUserId: { equals: login, mode: "insensitive" as const } }]
            : [])],
      },
    }),
    ...(login
      ? [
          db.integrationUserMapping.create({
            data: {
              integrationId: installation.id,
              externalUserId: login,
              userId: args.userId,
            },
          }),
        ]
      : []),
  ]);
}
