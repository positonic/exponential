"use client";

import Link from "next/link";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconPlayerStopFilled } from "@tabler/icons-react";

import {
  useActiveTimerContext,
  formatElapsedClock,
} from "~/hooks/useActiveTimer";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * Persistent active-timer widget for the side nav. Hidden when no timer is
 * running. Clicking the action name navigates to the Action's detail page;
 * clicking Stop finalizes the entry and the widget disappears via
 * `getActive.invalidate()` from the shared `ActiveTimerContext`.
 *
 * Requires `ActiveTimerProvider` to be mounted by the authenticated layout.
 */
export function ActiveTimerWidget() {
  const ctx = useActiveTimerContext();
  const { workspaceSlug } = useWorkspace();
  if (!ctx) return null;
  const { entry, elapsedMs, isRunning, stop, isStopping } = ctx;

  if (!isRunning || !entry) return null;

  const actionHref =
    workspaceSlug && entry.action?.id
      ? `/w/${workspaceSlug}/actions/${entry.action.id}`
      : "#";

  return (
    <div className="sb-active-timer mx-2.5 mb-2 flex items-center gap-2 rounded-lg border border-border-primary bg-surface-secondary px-2.5 py-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-primary"
        aria-hidden="true"
        style={{ animation: "pulse 1.5s ease-in-out infinite" }}
      />
      <Link
        href={actionHref}
        className="min-w-0 flex-1 truncate text-text-primary hover:text-brand-primary"
        title={entry.action?.name ?? "Untitled"}
      >
        <div className="truncate text-[13px] font-medium leading-tight">
          {entry.action?.name ?? "Untitled"}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-text-muted">
          {formatElapsedClock(elapsedMs)}
        </div>
      </Link>
      <Tooltip label="Stop timer" withArrow>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          aria-label="Stop timer"
          onClick={stop}
          loading={isStopping}
        >
          <IconPlayerStopFilled size={14} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
