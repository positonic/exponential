"use client";

import { Button, Tooltip } from "@mantine/core";
import { IconCheck, IconInfoCircle } from "@tabler/icons-react";

interface ReviewBottomBarProps {
  onSkip: () => void;
  onMarkReviewed: () => void;
  canMarkReviewed: boolean;
  isPending: boolean;
}

function HintKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-primary bg-surface-secondary px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
      {children}
    </kbd>
  );
}

export function ReviewBottomBar({
  onSkip,
  onMarkReviewed,
  canMarkReviewed,
  isPending,
}: ReviewBottomBarProps) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-border-primary pt-4">
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <IconInfoCircle size={14} />
        <span className="flex items-center gap-1.5">
          <HintKey>↩</HintKey> mark reviewed
        </span>
        <span className="flex items-center gap-1.5">
          <HintKey>S</HintKey> skip
        </span>
        <span className="flex items-center gap-1.5">
          <HintKey>←</HintKey>
          <HintKey>→</HintKey> navigate
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="subtle" color="gray" onClick={onSkip}>
          Skip
        </Button>
        <Tooltip
          label="Add at least one next action before marking as reviewed"
          disabled={canMarkReviewed}
          withArrow
        >
          <Button
            onClick={onMarkReviewed}
            loading={isPending}
            leftSection={<IconCheck size={16} />}
            disabled={!canMarkReviewed}
          >
            Mark reviewed
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
