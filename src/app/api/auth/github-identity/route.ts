import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import {
  GITHUB_IDENTITY_CALLBACK_PATH,
  GITHUB_IDENTITY_COOKIE,
  GITHUB_IDENTITY_COOKIE_PATH,
  buildGithubAuthorizeUrl,
  encodePendingLink,
  getGithubIdentityClient,
  newOAuthState,
  safeReturnPath,
  withOutcome,
} from "~/server/services/github/identityClaim";

/**
 * Start linking the signed-in user's GitHub account (the GitHub identity claim).
 * Sets a short-lived httpOnly cookie holding the CSRF state, then sends the
 * browser to GitHub's authorize page. See `identityClaim.ts`.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", origin));
  }

  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnUrl"));
  const client = getGithubIdentityClient();
  if (!client) {
    return NextResponse.redirect(new URL(withOutcome(returnTo, "not_configured"), origin));
  }

  const state = newOAuthState();
  const response = NextResponse.redirect(
    buildGithubAuthorizeUrl({
      clientId: client.clientId,
      redirectUri: `${origin}${GITHUB_IDENTITY_CALLBACK_PATH}`,
      state,
    }),
  );
  response.cookies.set(GITHUB_IDENTITY_COOKIE, encodePendingLink({ state, returnTo, userId: session.user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax still rides GitHub's top-level redirect back to the callback.
    sameSite: "lax",
    path: GITHUB_IDENTITY_COOKIE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}
