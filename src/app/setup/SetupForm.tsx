"use client";

import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { normalizeSignInEmail } from "~/lib/signInCode";

/** One message for every refusal: the provider deliberately doesn't say which check failed. */
export const SETUP_REFUSED_MESSAGE =
  "That didn't work: the setup token is wrong, has expired, or has already been used. Restart the app to print a new one.";

/**
 * Posts the email and setup token to the `setup` credentials provider. On
 * success the session cookie is set and we do a full navigation, so the next
 * page renders with the new admin's session.
 */
export function SetupForm() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || !token) return;
    setIsBusy(true);
    setError(null);
    let navigating = false;
    try {
      const result = await signIn("setup", {
        email: normalizeSignInEmail(email),
        token,
        redirect: false,
      });
      if (!result || result.error) {
        setError(SETUP_REFUSED_MESSAGE);
        return;
      }
      navigating = true;
      window.location.href = "/home";
    } catch {
      setError(SETUP_REFUSED_MESSAGE);
    } finally {
      if (!navigating) setIsBusy(false);
    }
  };

  return (
    <form className="verify-form" onSubmit={(event) => void handleSubmit(event)}>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <div className="field">
        <label className="field__label" htmlFor="setup-email">
          Your email address
        </label>
        <p className="field__desc" id="setup-email-desc">
          You&apos;ll sign in with this address from now on.
        </p>
        <input
          id="setup-email"
          className="field__input"
          type="email"
          aria-describedby="setup-email-desc"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="setup-token">
          Setup token
        </label>
        <input
          id="setup-token"
          className="field__input field__input--code"
          type="text"
          aria-describedby="setup-token-hint"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <p className="field__hint" id="setup-token-hint">
          Case-insensitive. The hyphens are optional.
        </p>
      </div>

      <button className="btn-primary" type="submit" disabled={isBusy || !email || !token}>
        <span>Claim this install</span>
      </button>
    </form>
  );
}
