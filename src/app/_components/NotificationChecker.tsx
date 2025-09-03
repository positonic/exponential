'use client';

import { useNotificationChecker } from '~/hooks/useNotificationChecker';

/**
 * Global notification checker component
 * Place this in your main layout to automatically show notifications on page load
 * Uses the existing Mantine notification system configured in MantineRootProvider
 */
export function NotificationChecker() {
  // This hook handles all the notification logic
  useNotificationChecker();

  // This component doesn't render anything visible
  // It just runs the notification checking logic
  return null;
}