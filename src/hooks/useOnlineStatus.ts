'use client';

import { useState, useEffect, useCallback } from 'react';

interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  clearWasOffline: () => void;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  const clearWasOffline = useCallback(() => {
    setWasOffline(false);
  }, []);

  useEffect(() => {
    // Initialize with actual state (only in browser)
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setIsOnline(true);
      // Keep wasOffline true so we can show reconnection message
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline, clearWasOffline };
}
