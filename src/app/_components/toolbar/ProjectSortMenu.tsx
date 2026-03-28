"use client";

import { useState } from "react";
import { ActionIcon, Popover, TextInput, UnstyledButton, Text } from "@mantine/core";
import {
  IconArrowsSort,
  IconLetterCase,
  IconCircleDot,
  IconFlag,
  IconChartBar,
  IconCalendarPlus,
  IconCalendar,
  IconCalendarEvent,
  IconCategory,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import type { ProjectSortState } from "./useProjectSort";
import type { TablerIcon } from "@tabler/icons-react";

interface SortFieldDef {
  key: string;
  label: string;
  icon: TablerIcon;
}

const SORT_FIELDS: SortFieldDef[] = [
  { key: "name", label: "Name", icon: IconLetterCase },
  { key: "status", label: "Status", icon: IconCircleDot },
  { key: "priority", label: "Priority", icon: IconFlag },
  { key: "progress", label: "Progress", icon: IconChartBar },
  { key: "createdAt", label: "Created", icon: IconCalendarPlus },
  { key: "startDate", label: "Start date", icon: IconCalendar },
  { key: "endDate", label: "End date", icon: IconCalendarEvent },
  { key: "type", label: "Type", icon: IconCategory },
];

interface ProjectSortMenuProps {
  sortState: ProjectSortState | null;
  onSortChange: (field: string) => void;
  onClearSort: () => void;
}

export function ProjectSortMenu({ sortState, onSortChange, onClearSort }: ProjectSortMenuProps) {
  const [opened, setOpened] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const filteredFields = filterQuery.trim()
    ? SORT_FIELDS.filter((f) => f.label.toLowerCase().includes(filterQuery.toLowerCase()))
    : SORT_FIELDS;

  const handleFieldClick = (key: string) => {
    if (sortState?.field === key) {
      // Clicking active field toggles direction — handled by onSortChange
      onSortChange(key);
    } else {
      onSortChange(key);
    }
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={220}
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <div className="relative">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={() => setOpened((o) => !o)}
            aria-label="Sort projects"
          >
            <IconArrowsSort size={18} />
          </ActionIcon>
          {sortState && (
            <div className="bg-brand-primary absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" />
          )}
        </div>
      </Popover.Target>

      <Popover.Dropdown className="bg-surface-primary border-border-primary p-0">
        <div className="border-border-primary border-b p-2">
          <TextInput
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.currentTarget.value)}
            placeholder="Sort by..."
            size="xs"
            variant="unstyled"
            className="text-text-primary"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filteredFields.map((field) => {
            const isActive = sortState?.field === field.key;
            const FieldIcon = field.icon;
            return (
              <UnstyledButton
                key={field.key}
                onClick={() => handleFieldClick(field.key)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <FieldIcon size={16} className="shrink-0 opacity-60" />
                <Text size="sm" className="flex-1">
                  {field.label}
                </Text>
                {isActive && (
                  sortState.direction === "asc" ? (
                    <IconSortAscending size={14} className="text-brand-primary shrink-0" />
                  ) : (
                    <IconSortDescending size={14} className="text-brand-primary shrink-0" />
                  )
                )}
              </UnstyledButton>
            );
          })}
          {filteredFields.length === 0 && (
            <Text size="xs" className="text-text-muted px-3 py-2">
              No matching fields
            </Text>
          )}
        </div>
        {sortState && (
          <div className="border-border-primary border-t p-1">
            <UnstyledButton
              onClick={() => {
                onClearSort();
                setOpened(false);
              }}
              className="text-text-muted hover:text-text-secondary w-full px-3 py-1.5 text-xs transition-colors"
            >
              Clear sort
            </UnstyledButton>
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
