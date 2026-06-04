import { type NextRequest, NextResponse } from "next/server";

import { auth } from "~/server/auth";
import {
  NATIVE_AUTH_REQUEST_COOKIE,
  NATIVE_REDIRECT_URI,
  REQUEST_COOKIE_TTL_SECONDS,
  isAllowedRedirectUri,
  isValidCodeChallenge,
  isValidState,
  mintAuthCode,
  signRequestState,
  verifyRequestState,
} from "~/server/utils/native-auth";

/**
 * `GET /api/auth/native/start` — entry point of the native sign-in handshake
 * (ADR 0005, `exponential-ios`). Opened inside `ASWebAuthenticationSession`.
 *
 * Two ways in:
 *   • First hit carries `?code_challenge&state&redirect_uri` from the app.
 *   • Post-login return carries no query — the params are recovered from a
 *     signed, httpOnly cookie set before we bounced the user to `/signin`.
 *
 * If authenticated → mint a 60s auth code bound to the userId + PKCE challenge
 * and 302 to `exponential://auth/callback?code&state`. If not → stash the
 * request in a signed cookie and redirect to `/signin`, which returns here.
 *
 * This handler is its own post-login callback — there is intentionally no
 * separate `/complete` route (the app never calls one; it only listens for the
 * custom-scheme redirect).
 */
export const dynamic = "force-dynamic";

function badRequest(): NextResponse {
  // Mirror the platform's terse 400 body; never leak which check failed.
  return NextResponse.json("Bad request.", { status: 400 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);

  // Prefer fresh query params (first hit); fall back to the signed cookie
  // (post-login return). Never read one field from query and another from the
  // cookie — take a whole consistent set from one source.
  let codeChallenge = url.searchParams.get("code_challenge");
  let state = url.searchParams.get("state");
  let redirectUri = url.searchParams.get("redirect_uri");

  if (!codeChallenge && !state && !redirectUri) {
    const saved = verifyRequestState(request.cookies.get(NATIVE_AUTH_REQUEST_COOKIE)?.value);
    if (saved) {
      codeChallenge = saved.codeChallenge;
      state = saved.state;
      redirectUri = saved.redirectUri;
    }
  }

  // Validate every input before trusting any of it.
  if (!isAllowedRedirectUri(redirectUri)) return badRequest();
  if (!isValidCodeChallenge(codeChallenge)) return badRequest();
  if (!isValidState(state)) return badRequest();

  const session = await auth();

  if (!session?.user?.id) {
    // Stash the (integrity-protected) request and send the user to sign in.
    // callbackUrl is the bare start path — params come back via the cookie, so
    // nothing tamperable rides in the URL.
    const res = NextResponse.redirect(
      new URL("/signin?callbackUrl=%2Fapi%2Fauth%2Fnative%2Fstart", url.origin),
    );
    res.cookies.set(NATIVE_AUTH_REQUEST_COOKIE, signRequestState({ codeChallenge, state, redirectUri }), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/native",
      maxAge: REQUEST_COOKIE_TTL_SECONDS,
    });
    return res;
  }

  const code = mintAuthCode({ sub: session.user.id, codeChallenge, redirectUri });
  const location = `${NATIVE_REDIRECT_URI}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

  // Custom-scheme redirect — build the response by hand (NextResponse.redirect
  // validates http(s) URLs and would reject the custom scheme).
  const res = new NextResponse(null, { status: 302, headers: { Location: location } });
  // Clear the one-shot request cookie.
  res.cookies.set(NATIVE_AUTH_REQUEST_COOKIE, "", { path: "/api/auth/native", maxAge: 0 });
  return res;
}
