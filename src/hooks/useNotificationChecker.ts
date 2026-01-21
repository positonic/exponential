'use client';

import { useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { useSession } from 'next-auth/react';

/**
 * Hook to check for and display new notifications on page load
 * Uses the existing notification system to show pending notifications as UI notifications
 *
 * IMPORTANT: This hook was fixed to prevent an infinite loop that was causing
 * database connection exhaustion. The previous implementation had:
 * 1. markAsRead in the useEffect dependency array (unstable reference)
 * 2. Multiple markAsRead calls per notification (onClose, onClick, setTimeout)
 * 3. Refetch on every mutation success
 * 4. No deduplication for shown notifications
 */
export function useNotificationChecker() {
  const { data: session } = useSession();

  // Track which notifications have been shown in this session to prevent duplicates
  const shownNotificationIds = useRef<Set<string>>(new Set());

  // Get pending notifications that haven't been shown yet
  // Only query when authenticated
  // Poll every 30 seconds instead of refetching on every mutation
  const { data: pendingNotifications } = api.notification.getScheduledNotifications.useQuery({
    status: 'pending',
    limit: 10,
  }, {
    enabled: !!session?.user,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Mutation to mark notifications as read
  // No onSuccess refetch - query will refetch on interval to prevent rapid re-fetching
  const markAsRead = api.notification.markNotificationRead.useMutation();

  useEffect(() => {
    if (!pendingNotifications?.length) return;

    // Show notification for each new transcription
    pendingNotifications.forEach((notification) => {
      // Skip if already shown in this session to prevent duplicates
      if (shownNotificationIds.current.has(notification.id)) return;
      shownNotificationIds.current.add(notification.id);

      if (notification.type === 'transcription_completed') {
        notifications.show({
          id: notification.id, // Use notification ID to prevent duplicate toasts
          title: notification.title,
          message: notification.message,
          color: 'blue',
          autoClose: 8000, // 8 seconds
        });

        // Mark as read immediately (single call, not multiple)
        markAsRead.mutate({ notificationId: notification.id });
      }
    });
    // Only depend on pendingNotifications - markAsRead is intentionally excluded
    // to prevent the effect from re-running when the mutation object reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotifications]);

  return {
    pendingNotifications,
    markAsRead: markAsRead.mutate,
    isLoading: markAsRead.isPending,
  };
}