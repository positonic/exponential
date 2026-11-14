/**
 * Our own `?error=` codes for `/signin`, beside the Auth.js ones. The `signIn`
 * callback redirects to `/signin?error=<code>` (Auth.js passes a returned URL
 * through, including for a code request made with `redirect: false`), and the
 * sign-in surfaces turn the code into words. Client-safe: no imports.
 */

/** Invite-only **Sign-up mode** and the address has no account and no pending invitation. */
export const SIGN_UP_CLOSED_ERROR = "SignUpClosed";

/**
 * Codes go to the server log (no email transport) and the address isn't an
 * instance admin's, so no code is written for it.
 */
export const EMAIL_SIGN_IN_UNAVAILABLE_ERROR = "EmailSignInUnavailable";

export const SIGN_UP_CLOSED_MESSAGE =
  "This install is invite-only, and that address has no account or pending invitation. Ask its admin to invite you, then sign in with the address they invited.";

export const EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE =
  "Email sign-in isn't set up on this install yet: there is no email delivery, so sign-in codes go to the server log, and only for the instance admin. Ask whoever runs it to configure SMTP, Postmark or an OAuth provider (Google or Discord).";

/** Words for one of our codes, or null when the code isn't ours. */
export function instanceSignInErrorMessage(error: string | null | undefined): string | null {
  switch (error) {
    case SIGN_UP_CLOSED_ERROR:
      return SIGN_UP_CLOSED_MESSAGE;
    case EMAIL_SIGN_IN_UNAVAILABLE_ERROR:
      return EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE;
    default:
      return null;
  }
}
