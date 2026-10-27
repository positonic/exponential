"use client";

import { Button, Tooltip, type ButtonProps } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";

interface GoalsMineToggleProps {
  onlyMine: boolean;
  onOnlyMineChange: (onlyMine: boolean) => void;
  /** Match the controls the toggle sits beside; defaults to `compact-xs`. */
  size?: ButtonProps["size"];
}

/**
 * The "Mine" toggle on the Goals page control line: a pressed/unpressed
 * button rather than a view, because it narrows whichever view is active
 * instead of replacing it.
 */
export function GoalsMineToggle({
  onlyMine,
  onOnlyMineChange,
  size = "compact-xs",
}: GoalsMineToggleProps) {
  return (
    <Tooltip label="Only objectives and key results you're the DRI on" withArrow>
      <Button
        size={size}
        variant={onlyMine ? "light" : "subtle"}
        color={onlyMine ? "brand" : "gray"}
        leftSection={<IconUser size={14} />}
        aria-pressed={onlyMine}
        onClick={() => onOnlyMineChange(!onlyMine)}
      >
        Mine
      </Button>
    </Tooltip>
  );
}
