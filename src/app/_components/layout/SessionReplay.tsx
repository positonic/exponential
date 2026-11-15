'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { env } from '~/env';

/**
 * Pages recorded by PostHog session replay. Kept deliberately narrow: the
 * signup path, and our own workspace. Customer workspaces are never recorded.
 * A bare entry covers the page and everything under it, on a segment
 * boundary, so `/welcome` never matches a sibling like `/welcome-back`.
 */
export const REPLAY_PATHS = ['/onboarding', '/welcome', '/w/exponential'];

export function shouldRecord(pathname: string): boolean {
  return REPLAY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Attributes a recording keeps, because the replay needs them to render.
 * Text masking does not reach attributes, and rrweb records every attribute
 * verbatim, so anything not listed here is masked: `title`, `aria-label`,
 * `alt`, `placeholder`, `href`, `id`, `value`, `name` and every attribute
 * nobody thought of yet. Names are compared lower-cased.
 */
const RENDERING_ATTRIBUTES = new Set([
  'class', 'type', 'role', 'dir', 'lang', 'hidden', 'open', 'disabled',
  'checked', 'selected', 'tabindex', 'width', 'height', 'colspan', 'rowspan',
  'cols', 'rows', 'rel', 'media', 'aria-hidden', 'aria-expanded',
  'aria-selected', 'aria-checked', 'aria-pressed', 'aria-current',
  'aria-disabled', 'aria-orientation',
  // SVG geometry, for icons.
  'xmlns', 'viewbox', 'preserveaspectratio', 'd', 'fill', 'fill-rule',
  'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'transform', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r',
  'rx', 'ry', 'points',
]);

/** Mantine styles on short state tokens: data-variant="filled", data-active. */
const STYLE_TOKEN = /^(?:[a-z]+(?:-[a-z]+)*)?$/;

export function maskAttribute(name: string, value: string, element?: Element): string {
  const attr = name.toLowerCase();
  // rrweb's own serialisation attributes (_cssText, rr_width, ...).
  if (attr.startsWith('_') || attr.startsWith('rr_')) return value;
  if (RENDERING_ATTRIBUTES.has(attr)) return value;
  // Inline layout stays; an image URL (a user's upload) does not.
  if (attr === 'style') return value.replace(/url\([^)]*\)/gi, 'url()');
  // Stylesheets are the app's own /_next/static assets.
  if (attr === 'href' && element?.tagName === 'LINK') return value;
  if (attr.startsWith('data-') && value.length <= 24 && STYLE_TOKEN.test(value)) return value;
  return value === '' ? value : '***';
}

// posthog-js is loaded on the first recorded page, so other pages never
// download it.
let client: Promise<PostHog> | null = null;

function loadPostHog(key: string): Promise<PostHog> {
  client ??= import('posthog-js').then(({ default: posthog }) => {
    initPostHog(posthog, key);
    return posthog;
  });
  return client;
}

function initPostHog(posthog: PostHog, key: string) {
  posthog.init(key, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    // Replay only: no events, no profiles, nothing stored on the device.
    persistence: 'memory',
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_web_experiments: true,
    enable_recording_console_log: false,
    // Recording starts only on a REPLAY_PATHS page (see the effect below).
    disable_session_recording: true,
    session_recording: {
      // Full masking: every text node, input and content-bearing attribute
      // renders as asterisks, and images, video and canvas are replaced by
      // same-sized placeholders, so a recording shows layout and interaction,
      // never content.
      maskAllInputs: true,
      maskTextSelector: '*',
      maskAttributeFn: maskAttribute,
      blockSelector: 'img, video, canvas, picture, iframe',
      recordHeaders: false,
      recordBody: false,
    },
  });
}

/**
 * Masked PostHog session replay on REPLAY_PATHS pages. Does nothing until
 * NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export function SessionReplay() {
  const pathname = usePathname();
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  // The page the user is on now, read when posthog-js finishes loading.
  const latestPath = useRef(pathname);
  latestPath.current = pathname;

  useEffect(() => {
    if (!key) return;
    if (shouldRecord(pathname)) {
      void loadPostHog(key).then((posthog) => {
        // They may have left for an unrecorded page while it loaded.
        if (!shouldRecord(latestPath.current)) return;
        if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording();
      });
    } else if (client) {
      // Unconditional: PostHog starts recording asynchronously, so a start
      // can still be in flight and not yet report itself as started.
      void client.then((posthog) => posthog.stopSessionRecording());
    }
  }, [key, pathname]);

  return null;
}
