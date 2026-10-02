/**
 * GitHub identity claim (CONTEXT.md): a user proves which GitHub account is
 * theirs by completing a GitHub OAuth round trip, and we store the login GitHub
 * itself returns on `User.githubLogin` / `User.githubId`. It is never typed in,
 * so nobody can claim someone else's PRs and commits, and it is never derived
 * from a GitHub App install (that is the installing account, often an org).
 *
 * This is a dedicated link flow (`/api/auth/github-identity`), not a NextAuth
 * provider: linking must not also make GitHub a way to sign in or create an
 * account. The OAuth token is used once to read `GET /user` and then dropped.
 */
import { randomBytes, timingSafeEqual } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

/** Short-lived, httpOnly cookie carrying the CSRF state and return path. */
export const GITHUB_IDENTITY_COOKIE = "gh_identity_oauth";
export const GITHUB_IDENTITY_COOKIE_PATH = "/api/auth/github-identity";
export const GITHUB_IDENTITY_CALLBACK_PATH = "/api/auth/github-identity/callback";
const DEFAULT_RETURN_PATH = "/settings/profile";

/** Outcome codes appended to the return path as `?github_link=<code>`. */
export type GithubLinkOutcome =
  | "linked"
  | "denied"
  | "invalid_state"
  | "taken"
  | "failed"
  | "not_configured";

/**
 * OAuth client for the link flow. Either a GitHub OAuth App or the existing
 * GitHub App's own client id/secret works; the callback URL
 * (`<origin>/api/auth/github-identity/callback`) must be registered on it.
 */
export function getGithubIdentityClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isGithubIdentityConfigured(): boolean {
  return getGithubIdentityClient() !== null;
}

/**
 * Only same-origin relative paths are allowed back — anything else (absolute
 * URLs, protocol-relative `//host`, backslash tricks) falls back to the
 * profile page, so the flow can't be used as an open redirect.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return DEFAULT_RETURN_PATH;
  }
  return raw;
}

/** Append `github_link=<outcome>` to a relative path, keeping its query. */
export function withOutcome(path: string, outcome: GithubLinkOutcome): string {
  return `${path}${path.includes("?") ? "&" : "?"}github_link=${outcome}`;
}

export function newOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function statesMatch(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PendingLink {
  state: string;
  returnTo: string;
  /**
   * The user who started the link. The callback must find the same user
   * signed in, or a session switched mid-flow (user A starts, user B is
   * signed in by the time GitHub redirects back) would hand A's GitHub
   * account to B.
   */
  userId: string;
}

export function encodePendingLink(pending: PendingLink): string {
  return Buffer.from(JSON.stringify(pending)).toString("base64url");
}

export function decodePendingLink(raw: string | undefined): PendingLink | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as Partial<PendingLink>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.userId !== "string" ||
      !parsed.userId
    ) {
      return null;
    }
    return {
      state: parsed.state,
      returnTo: safeReturnPath(parsed.returnTo),
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

export function buildGithubAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  // No scopes: reading the public profile of the authorizing user is all we need.
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export interface VerifiedGithubUser {
  /** GitHub's numeric user id, as a string. */
  id: string;
  login: string;
}

/**
 * Exchange the OAuth `code` for a token and read who it belongs to. Throws on
 * any failure; the token is not returned or stored.
 */
export async function fetchVerifiedGithubUser(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedGithubUser> {
  const doFetch = opts.fetchImpl ?? fetch;

  const tokenResponse = await doFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!token.access_token) {
    throw new Error(`GitHub token exchange failed: ${token.error ?? "no access_token"}`);
  }

  const userResponse = await doFetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) {
    throw new Error(`GitHub user lookup failed: ${userResponse.status}`);
  }
  const user = (await userResponse.json()) as { id?: unknown; login?: unknown };
  if (typeof user.id !== "number" || typeof user.login !== "string" || !user.login) {
    throw new Error("GitHub user lookup returned no id/login");
  }
  return { id: String(user.id), login: user.login };
}

export type ClaimResult = { ok: true; login: string } | { ok: false; reason: "taken" };

/**
 * Record `githubUser` as `userId`'s claim. A GitHub account already claimed by
 * a different user is refused (`taken`). Another user still holding the same
 * *login* under a different GitHub id has a stale claim (the login was renamed
 * and re-registered — logins are unique on GitHub at any moment), so it is
 * cleared rather than left to mis-attribute work.
 */
export async function claimGithubIdentity(
  db: PrismaClient,
  userId: string,
  githubUser: VerifiedGithubUser,
): Promise<ClaimResult> {
  const holder = await db.user.findUnique({
    where: { githubId: githubUser.id },
    select: { id: true },
  });
  if (holder && holder.id !== userId) return { ok: false, reason: "taken" };

  try {
    await db.$transaction([
      db.user.updateMany({
        where: {
          id: { not: userId },
          githubLogin: { equals: githubUser.login, mode: "insensitive" },
        },
        data: { githubLogin: null, githubId: null, githubLinkedAt: null },
      }),
      db.user.update({
        where: { id: userId },
        data: {
          githubLogin: githubUser.login,
          githubId: githubUser.id,
          githubLinkedAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    // Lost a race with another user claiming the same GitHub id.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "taken" };
    }
    throw error;
  }
  return { ok: true, login: githubUser.login };
}

export async function unlinkGithubIdentity(db: PrismaClient, userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { githubLogin: null, githubId: null, githubLinkedAt: null },
  });
}
