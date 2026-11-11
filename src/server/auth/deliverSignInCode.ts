import { db } from "~/server/db";
import { sendSignInCodeEmail, sendWelcomeWithSignInCodeEmail } from "~/server/services/EmailService";
import { formatSignInCode } from "~/lib/signInCode";
import { resolveSignInMethods } from "~/server/auth/signInMethods";

interface SignInCodeRequest {
  /** The normalized email address the code was issued for. */
  identifier: string;
  /** The raw Sign-in code (the Auth.js verification token). */
  token: string;
  /** Issue time + maxAge, as Auth.js stores it on the `VerificationToken` row. */
  expires: Date;
}

/**
 * Deliver a **Sign-in code** ([ADR-0056](../../../docs/adr/0056-sign-in-codes-replace-magic-links.md))
 * and retire the address's older codes. The body of the Auth.js email
 * provider's `sendVerificationRequest`.
 *
 * The channel comes from `resolveSignInMethods`:
 * - `postmark` / `smtp`: email it (`sendEmail` picks the transport).
 * - `log`: the operator set `AUTH_LOG_SIGN_IN_CODES` and has no transport, so
 *   the code goes to stdout. The line format is a contract — the self-host CI
 *   job greps for it. It is the same Auth.js token either way: a delivery
 *   channel, not a parallel credential.
 * - `null`: throw. Callers already turn a failed send into `SEND_FAILED_MESSAGE`.
 */
export async function deliverSignInCode({ identifier, token, expires }: SignInCodeRequest): Promise<void> {
  const { emailDelivery } = resolveSignInMethods(process.env);

  if (emailDelivery === null) {
    throw new Error(
      "Sign-in code delivery is not configured. Set AUTH_POSTMARK_KEY, or SMTP_HOST and EMAIL_FROM, or AUTH_LOG_SIGN_IN_CODES=true for a single-user install."
    );
  }

  if (emailDelivery === "log") {
    console.log(
      `[auth] Sign-in code for ${identifier}: ${formatSignInCode(token)} (AUTH_LOG_SIGN_IN_CODES is on: anyone who can read this log can sign in)`
    );
  } else {
    try {
      // Check if user exists to determine which email to send
      const existingUser = await db.user.findUnique({
        where: { email: identifier },
        select: { id: true },
      });

      if (existingUser) {
        // Returning user - send the bare sign-in code
        await sendSignInCodeEmail(identifier, token);
      } else {
        // New user - send welcome email with the code embedded
        await sendWelcomeWithSignInCodeEmail(identifier, token);
      }
    } catch (error) {
      console.error(
        `[Auth] Failed to send sign-in code email to ${identifier}:`,
        error
      );
      throw error;
    }
  }

  try {
    // Retire this address's older codes, because the entropy argument in
    // ADR-0056 assumes one live code per identifier and Auth.js's
    // `sendToken` never retires the previous row. Without this, N
    // requests leave N simultaneously-valid codes and the odds of a
    // blind guess landing scale linearly with N — on an endpoint we
    // can't rate limit. `expires` is issue time + maxAge, so "older" is
    // exactly "expires sooner".
    //
    // Strictly after the send, and that ordering is load-bearing: Auth.js
    // writes the new row via `Promise.all` whether or not the send throws,
    // so retiring first would answer a failed send by destroying the code
    // the user could still have typed and replacing it with one that never
    // arrived. Leaving them with nothing is worse than leaving them with
    // two.
    //
    // Retiring a still-unused code is otherwise the point, not a side
    // effect: ask for a second code and the first stops working. The
    // comparison is strict, so this can never delete the row for the code
    // just sent.
    //
    // Deliberately not keyed off the token hash, which would identify
    // "mine" exactly: that means re-deriving `sha256(token + secret)`,
    // and if `AUTH_SECRET` ever becomes an array for rotation the hash
    // silently diverges and this deletes the live row instead of the
    // stale ones — sign-in breaks for everyone. The residual cost of the
    // timestamp approach is far smaller: two near-simultaneous requests
    // for one address, on instances whose clocks disagree by more than
    // the gap between them, can retire the newer code instead of the
    // older. The user asks for another code.
    //
    // Emails only: legacy API-key rows share this table under an
    // `api-key:<userId>:<uid>` identifier, which never matches.
    await db.verificationToken.deleteMany({
      where: { identifier, expires: { lt: expires } },
    });
  } catch (error) {
    // Its own catch, and it deliberately does not rethrow: by this point
    // the code is in the user's inbox. Letting a failed cleanup escape
    // would surface as "we couldn't send that email, so no code is on
    // its way" — telling someone holding a working code to go and get
    // another one. Failing to retire the old ones just leaves the
    // pre-ADR-0056 status quo of more than one live code.
    //
    // Not routed through `reportHandledError`: it pulls in
    // `@sentry/nextjs`, and `middleware.ts` drags this whole config into
    // the Edge bundle. Revisit once the Edge-safe config split lands.
    console.error(
      `[Auth] Sent a sign-in code to ${identifier} but could not retire the older ones:`,
      error
    );
  }
}
