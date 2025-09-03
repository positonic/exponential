'use client';

import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

/**
 * Hook to check for and display new notifications on page load
 * Uses the existing notification system to show pending notifications as UI notifications
 */
export function useNotificationChecker() {
  // Get pending notifications that haven't been shown yet
  const { data: pendingNotifications, refetch } = api.notification.getScheduledNotifications.useQuery({
    status: 'pending',
    limit: 10,
  });

  // Mutation to mark notifications as read
  const markAsRead = api.notification.markNotificationRead.useMutation({
    onSuccess: () => {
      // Refetch notifications to update the list
      void refetch();
    },
  });

  useEffect(() => {
    if (!pendingNotifications?.length) return;

    // Show notification for each new transcription
    pendingNotifications.forEach((notification) => {
      if (notification.type === 'transcription_completed') {
        const metadata = notification.metadata as { transcriptionId?: string; actionItemCount?: number; meetingTitle?: string } | null;
        
        notifications.show({
          title: notification.title,
          message: notification.message,
          color: 'blue',
          autoClose: 8000, // 8 seconds
          onClose: () => {
            // Mark as read when user closes the notification
            markAsRead.mutate({ notificationId: notification.id });
          },
          onClick: () => {
            // Optional: Navigate to the transcription when clicked
            if (metadata?.transcriptionId) {
              // You could navigate to the transcription page here
              // router.push(`/recordings/${metadata.transcriptionId}`);
            }
            // Mark as read when clicked
            markAsRead.mutate({ notificationId: notification.id });
          },
        });

        // Also automatically mark as read after showing
        setTimeout(() => {
          markAsRead.mutate({ notificationId: notification.id });
        }, 100);
      }
    });
  }, [pendingNotifications, markAsRead]);

  return {
    pendingNotifications,
    markAsRead: markAsRead.mutate,
    isLoading: markAsRead.isPending,
  };
}