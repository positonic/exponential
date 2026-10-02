import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  GITHUB_IDENTITY_CALLBACK_PATH,
  GITHUB_IDENTITY_COOKIE,
  GITHUB_IDENTITY_COOKIE_PATH,
  type GithubLinkOutcome,
  claimGithubIdentity,
  decodePendingLink,
  fetchVerifiedGithubUser,
  getGithubIdentityClient,
  statesMatch,
  withOutcome,
} from "~/server/services/github/identityClaim";

/**
 * GitHub's redirect back from the link flow. Verifies the CSRF state against
 * the cookie set by the start route, asks GitHub who authorized, and records
 * that login as the signed-in user's GitHub identity claim.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const pending = decodePendingLink(request.cookies.get(GITHUB_IDENTITY_COOKIE)?.value);
  const returnTo = pending?.returnTo ?? "/settings/profile";

  const finish = (outcome: GithubLinkOutcome) => {
    const response = NextResponse.redirect(new URL(withOutcome(returnTo, outcome), origin));
    response.cookies.set(GITHUB_IDENTITY_COOKIE, "", {
      path: GITHUB_IDENTITY_COOKIE_PATH,
      maxAge: 0,
    });
    return response;
  };

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", origin));
  }

  if (params.get("error")) return finish("denied");
  if (!pending || !statesMatch(pending.state, params.get("state"))) {
    return finish("invalid_state");
  }
  // Only the user who started the link may finish it — never whoever happens
  // to be signed in when GitHub redirects back.
  if (pending.userId !== session.user.id) return finish("invalid_state");

  const client = getGithubIdentityClient();
  if (!client) return finish("not_configured");

  const code = params.get("code");
  if (!code) return finish("invalid_state");

  try {
    const githubUser = await fetchVerifiedGithubUser({
      code,
      redirectUri: `${origin}${GITHUB_IDENTITY_CALLBACK_PATH}`,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
    });
    const result = await claimGithubIdentity(db, session.user.id, githubUser);
    return finish(result.ok ? "linked" : "taken");
  } catch (error) {
    console.error("[github-identity] link failed:", error instanceof Error ? error.message : error);
    return finish("failed");
  }
}
