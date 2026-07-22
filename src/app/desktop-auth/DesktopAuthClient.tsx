"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Desktop sign-in bridge (Electron only). After the user completes OAuth in the
 * system browser, the Electron main process loads this page with the one-time
 * PKCE auth code and its matching verifier:
 *
 *   /desktop-auth?code=<auth code>&verifier=<pkce verifier>
 *
 * We hand both to the `desktop` Credentials provider, which verifies them
 * (reusing the native-auth handshake) and establishes the NextAuth session
 * cookie for this in-app web view, then we land the user on /home.
 */
export function DesktopAuthClient() {
  const params = useSearchParams();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guard against React 18 double-invoke — this must run exactly once.
    if (started.current) return;
    started.current = true;

    const code = params.get("code");
    const verifier = params.get("verifier");
    if (!code || !verifier) {
      setFailed(true);
      return;
    }

    void (async () => {
      // redirect:false so we can distinguish success from failure instead of
      // NextAuth bouncing us to /signin?error and losing the reason.
      const res = await signIn("desktop", {
        code,
        code_verifier: verifier,
        redirect: false,
      });
      if (res?.ok && !res.error) {
        window.location.href = "/home";
      } else {
        setFailed(true);
      }
    })();
  }, [params]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background-primary text-text-primary">
      {failed ? (
        <>
          <p className="text-lg font-medium">Sign-in didn&apos;t complete</p>
          <p className="text-sm text-text-secondary">
            The link may have expired. Please try signing in again from the app.
          </p>
          <a href="/signin" className="text-sm text-brand-primary underline">
            Back to sign in
          </a>
        </>
      ) : (
        <>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Signing you in…</p>
        </>
      )}
    </div>
  );
}
