"use client";

import { useOnlineStatus } from "~/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium">
      You&apos;re offline. Some features may be unavailable.
    </div>
  );
}
