'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { isPublicPath } from '~/lib/publicRoutes';

/**
 * Drops page views for pages that need a session, so Vercel Web Analytics
 * counts visitors to the public site (marketing, docs, published pages) and
 * not members using the app. "Public" is the middleware's own allowlist, so a
 * new public route is counted the day it is listed there.
 */
export function dropSignedInPageViews(event: BeforeSendEvent): BeforeSendEvent | null {
  return isPublicPath(new URL(event.url).pathname) ? event : null;
}

export function PublicAnalytics() {
  return <Analytics beforeSend={dropSignedInPageViews} />;
}
