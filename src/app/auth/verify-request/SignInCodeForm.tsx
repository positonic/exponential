"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  buildSignInCodeCallbackUrl,
  SIGN_IN_CALLBACK_KEY,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_EMAIL_KEY,
  normalizeSignInCode,
} from "~/lib/signInCode";

/**
 * Redeems a **Sign-in code** (ADR-0056).
 *
 * Submitting navigates to Auth.js's ordinary email callback — the endpoint a
 * magic link would have hit — so user creation, `events.createUser` and
 * `emailVerified` all stay on the standard path. A full navigation rather than
 * `fetch`, because the response sets the session cookie and redirects.
 *
 * Styled with the shared `.auth-surface` field classes so the page reads as
 * the same surface as /signin, not a Mantine island inside it.
 */
export function SignInCodeForm() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("/home");
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SIGN_IN_EMAIL_KEY);
    const storedCallback = window.sessionStorage.getItem(SIGN_IN_CALLBACK_KEY);
    if (stored) setEmail(stored);
    if (storedCallback) setCallbackUrl(storedCallback);

    // Focused here rather than with `autoFocus`, which React only applies when
    // an input mounts. Both fields are always mounted now, and whether we know
    // the address is only discovered in this effect — one render too late for
    // `autoFocus` to act on, so it would silently never move.
    if (stored) codeRef.current?.focus();
    else emailRef.current?.focus();
  }, []);

  const normalized = normalizeSignInCode(code);
  const isComplete = normalized.length === SIGN_IN_CODE_LENGTH && email !== "";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isComplete) return;
    window.location.href = buildSignInCodeCallbackUrl({
      email,
      code: normalized,
      callbackUrl,
    });
  };

  return (
    <form className="verify-form" onSubmit={handleSubmit}>
      {/*
        Always shown, even when we recovered the address from the sign-in
        page. `sessionStorage` outlives the attempt that wrote it, so the
        stashed value can be the wrong one — request a code for a personal
        address in this tab, then arrive here holding an invite code sent to
        a work address, and a hidden field would redeem against the personal
        one and report "that code is incorrect" with nothing to correct. A
        code is only ever valid against one identifier, so showing which one
        is about to be used is worth the extra field.
      */}
      <div className="field">
        <label className="field__label" htmlFor="verify-email">
          Email address
        </label>
        {/* aria-describedby restores what Mantine's `description` prop wired
            up automatically — without it screen readers never announce these. */}
        <p className="field__desc" id="verify-email-desc">
          The address the code was sent to.
        </p>
        <input
          ref={emailRef}
          id="verify-email"
          className="field__input"
          type="email"
          aria-describedby="verify-email-desc"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="verify-code">
          Sign-in code
        </label>
        <input
          ref={codeRef}
          id="verify-code"
          // The code is Crockford base32 and we fold case on submit, so the
          // uppercase (via .field__input--code) is purely visual, matching
          // how the code appears in the email.
          className="field__input field__input--code"
          type="text"
          aria-describedby="verify-code-hint"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          autoComplete="one-time-code"
          spellCheck={false}
          required
        />
        <p className="field__hint" id="verify-code-hint">
          Codes are case-insensitive. The hyphen is optional.
        </p>
      </div>

      <button className="btn-primary" type="submit" disabled={!isComplete}>
        <span>Sign in</span>
        <ArrowRightGlyph />
      </button>
    </form>
  );
}

function ArrowRightGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
