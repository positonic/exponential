'use client';

import { useInboxCounts } from "~/hooks/useInboxCounts";

/**
 * The sidebar's Inbox badge: unread notifications plus "Waiting on me" — the
 * things that need you. Unsorted actions are counted on the inbox's Actions
 * tab instead.
 */
export function InboxCount() {
  const { total, isError } = useInboxCounts();

  if (isError) return null; // Don't show count if there's an error

  return (
    <span className="ml-auto text-gray-500">{total ?? 0}</span>
  );
}
