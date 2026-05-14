"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "~/trpc/react";

/**
 * Subscribes to the user's globally-running TimeEntry (if any) and computes
 * elapsed time locally with a 1-second tick. Server is authoritative for the
 * timer itself; only the tick is client-side.
 *
 * The widget consumes `{ entry, elapsedMs, stop, isRunning }`. When there is
 * no running entry, the interval is not scheduled.
 */
export function useActiveTimer() {
  const utils = api.useUtils();

  const { data: entry, isLoading } = api.timeEntry.getActive.useQuery(
    undefined,
    {
      // Re-check on tab focus so other devices/the plugin can drive state.
      refetchOnWindowFocus: true,
      // Refresh occasionally so a side-channel Stop (plugin) propagates even
      // without focus changes.
      refetchInterval: 30_000,
    },
  );

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!entry) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // We only want to re-establish the tick when the running entry changes
    // identity, not on every refetch reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const elapsedMs = entry
    ? Math.max(0, now - new Date(entry.startedAt).getTime())
    : 0;

  const stopMutation = api.timeEntry.stop.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.timeEntry.getActive.invalidate(),
        utils.timeEntry.listRecent.invalidate(),
      ]);
    },
  });

  const stop = useCallback(() => {
    if (!entry) return;
    stopMutation.mutate({ entryId: entry.id });
  }, [entry, stopMutation]);

  return {
    entry: entry ?? null,
    elapsedMs,
    isRunning: Boolean(entry),
    isLoading,
    stop,
    isStopping: stopMutation.isPending,
  };
}

export type ActiveTimerContextValue = ReturnType<typeof useActiveTimer>;

const ActiveTimerContext = createContext<ActiveTimerContextValue | null>(null);

/**
 * Wraps `useActiveTimer` in a context so all consumers (sidebar widget, action
 * surface indicators, calendar overlay) share a single subscription per page.
 * Mount once at the authenticated layout root.
 */
export function ActiveTimerProvider({ children }: { children: ReactNode }) {
  const value = useActiveTimer();
  return (
    <ActiveTimerContext.Provider value={value}>
      {children}
    </ActiveTimerContext.Provider>
  );
}

/**
 * Returns the shared active-timer context. Returns null when not wrapped by a
 * provider — callers should treat that as "no timer info available" and render
 * nothing, rather than spinning up a duplicate subscription.
 */
export function useActiveTimerContext(): ActiveTimerContextValue | null {
  return useContext(ActiveTimerContext);
}

export function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
