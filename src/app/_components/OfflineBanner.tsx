'use client';

import { useEffect } from 'react';
import { useOnlineStatus } from '~/hooks/useOnlineStatus';
import { IconWifiOff, IconRefresh } from '@tabler/icons-react';
import { Transition } from '@mantine/core';

export function OfflineBanner() {
  const { isOnline, wasOffline, clearWasOffline } = useOnlineStatus();

  // Auto-hide reconnection banner after 3 seconds
  useEffect(() => {
    if (isOnline && wasOffline) {
      const timer = setTimeout(() => {
        clearWasOffline();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, clearWasOffline]);

  return (
    <>
      {/* Offline Banner */}
      <Transition mounted={!isOnline} transition="slide-down" duration={300}>
        {(styles) => (
          <div
            style={styles}
            className="fixed top-0 left-0 right-0 z-[9999] bg-yellow-900/90 border-b border-yellow-700 px-4 py-2 backdrop-blur-sm"
          >
            <div className="flex items-center justify-center gap-2 text-yellow-100">
              <IconWifiOff size={16} />
              <span className="text-sm font-medium">
                You&apos;re offline. Some features may be unavailable.
              </span>
            </div>
          </div>
        )}
      </Transition>

      {/* Reconnected Banner */}
      <Transition mounted={isOnline && wasOffline} transition="slide-down" duration={300}>
        {(styles) => (
          <div
            style={styles}
            className="fixed top-0 left-0 right-0 z-[9999] bg-green-800/90 border-b border-green-600 px-4 py-2 backdrop-blur-sm"
          >
            <div className="flex items-center justify-center gap-2 text-green-100">
              <IconRefresh size={16} className="animate-spin" />
              <span className="text-sm font-medium">
                You&apos;re back online! Refreshing data...
              </span>
            </div>
          </div>
        )}
      </Transition>
    </>
  );
}
