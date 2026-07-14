"use client";

import { ActionIcon, Button, Menu, Text, Tooltip } from "@mantine/core";
import { IconChevronUp, IconX } from "@tabler/icons-react";

/**
 * Floating bulk-action bar shown while a multi-select is active. Fixed to
 * the bottom-center of the viewport so it works identically over table,
 * list, board and card views without shifting page layout.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border-primary px-2 py-1.5 shadow-lg"
      style={{ backgroundColor: "var(--color-bg-elevated)" }}
    >
      <Text
        size="xs"
        fw={600}
        className="whitespace-nowrap px-2 text-text-primary"
      >
        {count} selected
      </Text>
      <div className="h-4 w-px bg-border-primary" />
      {children}
      <div className="h-4 w-px bg-border-primary" />
      <Tooltip label="Clear selection (Esc)" position="top">
        <ActionIcon
          variant="subtle"
          size="sm"
          className="text-text-muted hover:text-text-primary"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <IconX size={14} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

/** One dropdown action in the bulk bar (opens upward). */
export function BulkActionMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Menu position="top" withinPortal shadow="md">
      <Menu.Target>
        <Button
          variant="subtle"
          size="compact-xs"
          color="gray"
          className="text-text-secondary hover:text-text-primary"
          rightSection={<IconChevronUp size={12} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown style={{ maxHeight: 320, overflowY: "auto" }}>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}
