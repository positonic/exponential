/**
 * Browser-side PostHog: page views and session replay.
 *
 * Product events (what people *do*) are captured server-side by the tRPC
 * middleware (src/server/analytics/posthog.ts). The browser SDK adds only what
 * the server cannot see: page views, page leaves, and session replay.
 *
 * Privacy stance — Exponential holds people's private work (tasks, notes,
 * meeting transcripts, CRM contacts), so the defaults are deliberately strict:
 *
 * - **Replays mask all text and all inputs.** Layout, navigation, clicks and
 *   rage clicks stay visible; what people wrote does not.
 * - **Autocapture is off.** Click events carry element text, which would leak
 *   content; the server middleware already records every mutation.
 * - **Only signed-in users get person profiles.** Anonymous marketing visitors
 *   still count as page views but don't create persons.
 * - **No exception capture.** Sentry owns errors.
 *
 * Traffic goes through the same-origin `/ingest` proxy (next.config.js
 * rewrites) so ad blockers don't drop it and the CSP needs no new origins.
 *
 * Disabled entirely when `NEXT_PUBLIC_POSTHOG_KEY` is unset.
 * Decision: docs/adr/0076-posthog-server-side-analytics.md.
 */
import posthog, { type PostHogConfig } from "posthog-js";

/** Same-origin path rewritten to PostHog's EU ingestion host. */
export const POSTHOG_PROXY_PATH = "/ingest";

export const posthogBrowserConfig = {
  api_host: POSTHOG_PROXY_PATH,
  // Links from the toolbar and replays point at the real PostHog app.
  ui_host: "https://eu.posthog.com",
  // Pinned so a posthog-js upgrade can't silently change what is collected.
  defaults: "2026-08-30",
  capture_pageview: "history_change",
  capture_pageleave: true,
  person_profiles: "identified_only",
  autocapture: false,
  capture_exceptions: false,
  mask_all_text: true,
  mask_all_element_attributes: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: "*",
  },
} satisfies Partial<PostHogConfig>;

/** Initialise PostHog once, from `src/instrumentation-client.ts`. */
export function initPostHogBrowser(key: string | undefined): boolean {
  if (!key || typeof window === "undefined") return false;
  posthog.init(key, posthogBrowserConfig);
  return true;
}

/**
 * Tie this browser to the signed-in user, using the same distinct id as the
 * server-side events (the user id) so both streams land on one person. No
 * email or name is sent. Signing out resets to a fresh anonymous id.
 */
export function syncPostHogIdentity(userId: string | null): void {
  if (!posthog.__loaded) return;
  if (userId) {
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
    return;
  }
  if (posthog.get_property("$user_state") === "identified") posthog.reset();
}
