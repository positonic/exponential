"use client";

import {
  useActiveTimerContext,
  formatElapsedClock,
} from "~/hooks/useActiveTimer";

interface ActiveTimerIndicatorProps {
  actionId: string;
  /**
   * Compact mode renders only the dot (no text). Useful for tight surfaces
   * like kanban card headers; default mode also shows the elapsed clock.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Inline indicator that renders only when the running TimeEntry's action
 * matches `actionId`. Consumes the shared `ActiveTimerContext` so dropping it
 * onto every kanban card / row creates zero extra subscriptions.
 */
export function ActiveTimerIndicator({
  actionId,
  compact,
  className,
}: ActiveTimerIndicatorProps) {
  const ctx = useActiveTimerContext();
  if (!ctx?.entry || !ctx.isRunning) return null;
  if (ctx.entry.action?.id !== actionId) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-brand-primary ${className ?? ""}`}
      aria-label="Timer running"
      title="Tracking time on this action"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-brand-primary"
        style={{ animation: "pulse 1.5s ease-in-out infinite" }}
        aria-hidden="true"
      />
      {!compact && (
        <span className="font-mono text-[11px] tabular-nums">
          {formatElapsedClock(ctx.elapsedMs)}
        </span>
      )}
    </span>
  );
}
