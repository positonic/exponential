'use client';

import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

/**
 * Metadata structure for transcription completion notifications
 */
interface TranscriptionNotificationMetadata {
  transcriptionId?: string;
  actionItemCount?: number;
  meetingTitle?: string;
}

/**
 * Runtime type guard to validate notification metadata
 */
function isValidTranscriptionMetadata(metadata: unknown): metadata is TranscriptionNotificationMetadata | null {
  if (metadata === null || metadata === undefined) {
    return true;
  }
  
  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }
  
  const obj = metadata as Record<string, unknown>;
  
  // Check transcriptionId if present
  if ('transcriptionId' in obj && obj.transcriptionId !== undefined) {
    if (typeof obj.transcriptionId !== 'string') {
      return false;
    }
  }
  
  // Check actionItemCount if present
  if ('actionItemCount' in obj && obj.actionItemCount !== undefined) {
    if (typeof obj.actionItemCount !== 'number') {
      return false;
    }
  }
  
  // Check meetingTitle if present
  if ('meetingTitle' in obj && obj.meetingTitle !== undefined) {
    if (typeof obj.meetingTitle !== 'string') {
      return false;
    }
  }
  
  return true;
}

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
        // Validate and type the metadata safely
        const metadata: TranscriptionNotificationMetadata | null = 
          isValidTranscriptionMetadata(notification.metadata) 
            ? (notification.metadata as TranscriptionNotificationMetadata | null)
            : null;
        
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