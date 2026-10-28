"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

import { syncPostHogIdentity } from "~/lib/analytics/posthogBrowser";

/**
 * Keeps PostHog's browser identity in step with the NextAuth session, so page
 * views and replays join the same person as the server-side tRPC events.
 * Renders nothing; a no-op when PostHog isn't initialised.
 */
export function PostHogIdentify() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (status === "loading") return;
    syncPostHogIdentity(userId);
  }, [status, userId]);

  return null;
}
