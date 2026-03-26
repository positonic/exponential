"use client";

import type { ReactNode } from "react";
import { Group, ActionIcon, Collapse } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconFilter } from "@tabler/icons-react";
import { SearchBox } from "./SearchBox";

interface ToolbarActionsProps {
  /** Controlled search value */
  searchValue?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Whether filter content exists (shows filter icon) */
  hasFilter?: boolean;
  /** When true, shows a dot indicator on the filter icon */
  hasActiveFilters?: boolean;
  /** Toggle the filter row */
  onToggleFilter?: () => void;
  /** Extra content after the icons */
  extra?: ReactNode;
}

export function ToolbarActions({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  hasFilter = false,
  hasActiveFilters = false,
  onToggleFilter,
  extra,
}: ToolbarActionsProps) {
  return (
    <Group gap="xs">
      {onSearchChange && searchValue !== undefined && (
        <SearchBox
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      )}
      {hasFilter && onToggleFilter && (
        <div className="relative">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={onToggleFilter}
            aria-label="Toggle filters"
          >
            <IconFilter size={18} />
          </ActionIcon>
          {hasActiveFilters && (
            <div className="bg-brand-primary absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" />
          )}
        </div>
      )}
      {extra}
    </Group>
  );
}

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
  /** Extra content in the actions area */
  rightSection?: ReactNode;
  /** Render prop to place actions (search/filter icons) elsewhere (e.g. in tabs row) */
  renderActions?: (actions: ReactNode) => ReactNode;
}

export function ViewToolbar({
  filterContent,
  hasActiveFilters = false,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  rightSection,
  renderActions,
}: ViewToolbarProps) {
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);

  const showFilterRow = filterRowOpen || hasActiveFilters;

  const actions = (
    <ToolbarActions
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      hasFilter={!!filterContent}
      hasActiveFilters={hasActiveFilters}
      onToggleFilter={toggleFilterRow}
      extra={rightSection}
    />
  );

  return (
    <div>
      {renderActions ? renderActions(actions) : actions}

      {filterContent && (
        <Collapse in={showFilterRow}>
          <div className="mb-3">{filterContent}</div>
        </Collapse>
      )}
    </div>
  );
}
