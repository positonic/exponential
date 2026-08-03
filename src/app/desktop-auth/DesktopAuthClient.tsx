"use client";

import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { getDesktopBridge } from "~/lib/platform";

/**
 * Desktop sign-in landing page, shared by both shells. After the user completes
 * OAuth in the system browser, the shell loads this page and holds the one-time
 * PKCE auth code + verifier. We fetch that pair **over IPC**, never from the URL
 * — a query string would leak the verifier (the secret that protects the code)
 * into server access logs, browser history, and Referer headers. We then hand it
 * to the `desktop` Credentials provider, which verifies it and establishes the
 * NextAuth session cookie for this in-app web view, and land the user on /home.
 */
export function DesktopAuthClient() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guard against React 18 double-invoke — this must run exactly once (the
    // IPC read is one-shot and clears the pending credentials on the main side).
    if (started.current) return;
    started.current = true;

    void (async () => {
      const pending = (await getDesktopBridge()?.getPendingAuth()) ?? null;
      if (!pending) {
        setFailed(true);
        return;
      }

      // redirect:false so we can distinguish success from failure instead of
      // NextAuth bouncing us to /signin?error and losing the reason. The code +
      // verifier travel only in this POST body, never in a URL.
      const res = await signIn("desktop", {
        code: pending.code,
        code_verifier: pending.verifier,
        redirect: false,
      });
      if (res?.ok && !res.error) {
        window.location.href = "/home";
      } else {
        setFailed(true);
      }
    })();
  }, []);

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
