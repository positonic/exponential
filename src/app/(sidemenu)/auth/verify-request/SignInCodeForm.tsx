"use client";

import { Button, Stack, Text, TextInput } from "@mantine/core";
import { type FormEvent, useEffect, useState } from "react";
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
 */
export function SignInCodeForm() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("/home");
  // Whether we recovered the address from the sign-in page. If not — a fresh
  // tab, or a different browser than the one that requested the code — we have
  // to ask for it, since the code is only valid against its identifier.
  const [knowsEmail, setKnowsEmail] = useState(true);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SIGN_IN_EMAIL_KEY);
    const storedCallback = window.sessionStorage.getItem(SIGN_IN_CALLBACK_KEY);
    if (stored) setEmail(stored);
    else setKnowsEmail(false);
    if (storedCallback) setCallbackUrl(storedCallback);
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
    <form onSubmit={handleSubmit}>
      <Stack gap="sm">
        {!knowsEmail && (
          <TextInput
            label="Email address"
            placeholder="you@company.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            autoComplete="email"
            required
          />
        )}

        <TextInput
          label="Sign-in code"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          autoComplete="one-time-code"
          autoFocus={knowsEmail}
          spellCheck={false}
          // The code is Crockford base32 and we fold case on submit, so the
          // uppercase here is purely so it matches the email visually.
          styles={{ input: { textTransform: "uppercase", letterSpacing: "0.15em" } }}
          required
        />

        <Button type="submit" disabled={!isComplete} fullWidth>
          Sign in
        </Button>

        <Text size="xs" className="text-text-muted">
          Codes are case-insensitive. The hyphen is optional.
        </Text>
      </Stack>
    </form>
  );
}
