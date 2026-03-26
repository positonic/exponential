"use client";

import type { ReactNode } from "react";
import { Group, ActionIcon, Collapse } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconFilter } from "@tabler/icons-react";
import { SearchBox } from "./SearchBox";

interface ViewToolbarProps {
  /** The FilterBar component to render in the collapsible row */
  filterContent?: ReactNode;
  /** When true, shows a dot indicator on the filter icon and keeps the row visible */
  hasActiveFilters?: boolean;
  /** Controlled search value */
  searchValue?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Content for the left side of the toolbar (e.g. view tabs) */
  leftSection?: ReactNode;
  /** Content for the right side of the toolbar (e.g. "New" button) */
  rightSection?: ReactNode;
}

export function ViewToolbar({
  filterContent,
  hasActiveFilters = false,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  leftSection,
  rightSection,
}: ViewToolbarProps) {
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);

  const showFilterRow = filterRowOpen || hasActiveFilters;

  return (
    <div>
      <Group justify="space-between" align="center" mb="xs">
        <Group gap="sm">{leftSection}</Group>
        <Group gap="xs">
          {onSearchChange && searchValue !== undefined && (
            <SearchBox
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
            />
          )}
          {filterContent && (
            <div className="relative">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                onClick={toggleFilterRow}
                aria-label="Toggle filters"
              >
                <IconFilter size={18} />
              </ActionIcon>
              {hasActiveFilters && (
                <div className="bg-brand-primary absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" />
              )}
            </div>
          )}
          {rightSection}
        </Group>
      </Group>

      {filterContent && (
        <Collapse in={showFilterRow}>
          <div className="mb-3">{filterContent}</div>
        </Collapse>
      )}
    </div>
  );
}
