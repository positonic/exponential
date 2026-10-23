'use client';

import { useInboxCounts } from "~/hooks/useInboxCounts";

/** Past this the number stops meaning anything; the badge says "a lot". */
const BADGE_CAP = 99;

/**
 * The sidebar's Inbox badge: unread notifications, "Waiting on me", and
 * Delegated results needing you (never live runs) — the things that need you.
 * Unsorted actions are counted on the inbox's Actions tab instead.
 *
 * Renders nothing at zero (like Today's badge), and caps at "99+" so a backlog
 * reads as a backlog rather than a precise number nobody will act on.
 */
export function InboxCount() {
  const { total, isError } = useInboxCounts();

  if (isError) return null; // Don't show count if there's an error
  if (!total) return null;

  return <>{total > BADGE_CAP ? `${BADGE_CAP}+` : total}</>;
}
