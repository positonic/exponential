"use client";

import { Button, Group, Tooltip } from "@mantine/core";
import { IconTimeline, IconUser } from "@tabler/icons-react";
import type { GoalsView } from "./useGoalsViewParams";

interface GoalsViewTogglesProps {
  onlyMine: boolean;
  view: GoalsView;
  onOnlyMineChange: (onlyMine: boolean) => void;
  onViewChange: (view: GoalsView) => void;
}

/**
 * The two view toggles that sit beside the Goals / OKRs tabs. Each is a
 * pressed/unpressed button rather than a tab: they modify whichever tab is
 * active instead of replacing it.
 */
export function GoalsViewToggles({
  onlyMine,
  view,
  onOnlyMineChange,
  onViewChange,
}: GoalsViewTogglesProps) {
  const isTimeline = view === "timeline";
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label="Only goals and OKRs you're the DRI on" withArrow>
        <Button
          size="compact-xs"
          variant={onlyMine ? "light" : "subtle"}
          color={onlyMine ? "brand" : "gray"}
          leftSection={<IconUser size={14} />}
          aria-pressed={onlyMine}
          onClick={() => onOnlyMineChange(!onlyMine)}
        >
          Mine
        </Button>
      </Tooltip>
      <Tooltip label="Show this tab on a timeline" withArrow>
        <Button
          size="compact-xs"
          variant={isTimeline ? "light" : "subtle"}
          color={isTimeline ? "brand" : "gray"}
          leftSection={<IconTimeline size={14} />}
          aria-pressed={isTimeline}
          onClick={() => onViewChange(isTimeline ? "list" : "timeline")}
        >
          Timeline
        </Button>
      </Tooltip>
    </Group>
  );
}
