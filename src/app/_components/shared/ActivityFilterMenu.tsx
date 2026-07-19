"use client";

import { useEffect, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { ActivityFilter } from "./activityTypes";

const STORAGE_KEY = "activity-feed-filter";

const OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All activity" },
  { value: "comments", label: "Comments" },
  { value: "changes", label: "Changes" },
];

/**
 * The timeline filter preference: one setting shared across every activity
 * surface (not per-entity), persisted in localStorage.
 */
export function useActivityFilter(): [ActivityFilter, (f: ActivityFilter) => void] {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "comments" || stored === "changes") setFilter(stored);
  }, []);
  const update = (next: ActivityFilter) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setFilter(next);
  };
  return [filter, update];
}

/**
 * Linear-style timeline filter dropdown for the ACTIVITY section header:
 * a quiet text button showing the current value, opening All / Comments /
 * Changes with a checkmark on the active option.
 */
export function ActivityFilterMenu({
  value,
  onChange,
}: {
  value: ActivityFilter;
  onChange: (filter: ActivityFilter) => void;
}) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]!;
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <Button
          variant="subtle"
          size="compact-xs"
          color="gray"
          className="text-text-muted hover:text-text-primary"
          rightSection={<IconChevronDown size={12} />}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {current.label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {OPTIONS.map((option) => (
          <Menu.Item
            key={option.value}
            leftSection={
              option.value === value ? (
                <IconCheck size={13} />
              ) : (
                <span style={{ width: 13, display: "inline-block" }} />
              )
            }
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
