/**
 * Sign-in codes — the emailed, typed-not-clicked credential that replaced
 * magic links ([ADR-0056](../../docs/adr/0056-sign-in-codes-replace-magic-links.md)).
 *
 * Lives in `lib/` rather than `server/` because both sides need it: the server
 * mints and emails the code, the sign-in page normalizes what the user types.
 *
 * Corporate mail security (Mimecast URL Protect and friends) follows links in
 * email, and a NextAuth email token is single-use, so the scanner spends the
 * token and the human gets "invalid or expired". A typed code has no URL to
 * follow, so nothing can spend it on the user's behalf.
 *
 * This module is imported by `src/server/auth/config.ts`, which `middleware.ts`
 * pulls into the **Edge** bundle — hence Web Crypto (`crypto.getRandomValues`,
 * available on Edge and Node 18+) rather than `node:crypto`.
 */

/**
 * Crockford base32, which omits I, L, O and U. The first three are the
 * characters people misread off a phone screen (0/O, 1/I/l); dropping U means
 * a generated code can't spell anything unfortunate.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const SIGN_IN_CODE_LENGTH = 8;

/**
 * How long a code stays valid, as Auth.js's email-provider `maxAge`. Short on
 * purpose: a typed code is used within a minute or two, and the window is the
 * only thing bounding guesses against an endpoint we can't throttle. Exported
 * so the provider config and the email copy can't drift apart.
 */
export const SIGN_IN_CODE_TTL_SECONDS = 10 * 60;
export const SIGN_IN_CODE_TTL_MINUTES = SIGN_IN_CODE_TTL_SECONDS / 60;

/**
 * ~10^12 possibilities. Sized to survive being guessed at rather than
 * rate-limited: verification lands on Auth.js's own `/api/auth/callback/*`
 * route, which has no rate limiting and is excluded from the `middleware.ts`
 * matcher, so entropy carries the weight here. A 6-digit PIN (10^6) would not.
 */
export function generateSignInCode(): string {
  const bytes = new Uint8Array(SIGN_IN_CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    // 32 divides 256 exactly, so the modulo is uniform — no rejection
    // sampling needed. This stops being true if ALPHABET ever changes length.
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

/** `ABCD1234` -> `ABCD-1234`, so it can be read off a screen or aloud. */
export function formatSignInCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Accept what a human actually types: lower case, the hyphen we display, stray
 * whitespace, and the characters Crockford folds back onto digits (I and L
 * read as 1, O as 0) so a misread code still works.
 */
export function normalizeSignInCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/**
 * `sessionStorage` keys handing the identifier from `/signin` to the verify
 * page, which needs it to redeem the code. Deliberately not a query parameter:
 * an email address is personal data and has no business in a URL.
 */
export const SIGN_IN_EMAIL_KEY = "exponential:signin-email";
export const SIGN_IN_CALLBACK_KEY = "exponential:signin-callback";

/**
 * The identifier has to match what Auth.js stored the token against, and its
 * `defaultNormalizer` lower-cases and trims. Getting this wrong looks exactly
 * like a wrong code.
 */
export function normalizeSignInEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Redeeming a code means handing it to Auth.js's ordinary email callback — the
 * same endpoint a magic link would have hit, just reached by typing rather than
 * clicking. That's what keeps user creation, `events.createUser` and
 * `emailVerified` on the standard path (ADR-0056).
 */
export function buildSignInCodeCallbackUrl(options: {
  email: string;
  code: string;
  callbackUrl: string;
}): string {
  const params = new URLSearchParams({
    callbackUrl: options.callbackUrl,
    token: normalizeSignInCode(options.code),
    email: normalizeSignInEmail(options.email),
  });
  return `/api/auth/callback/postmark?${params.toString()}`;
}
