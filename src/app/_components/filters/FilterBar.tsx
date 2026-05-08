"use client";

import { useState, useCallback } from "react";
import { Group, Button, Popover, Text, ActionIcon } from "@mantine/core";
import { IconPlus, IconArrowLeft, IconX } from "@tabler/icons-react";
import { hasActiveFilters as checkActiveFilters } from "~/types/filter";
import type { FilterBarConfig, FilterField, FilterState, FilterMember } from "~/types/filter";
import { FilterFieldPicker } from "./FilterFieldPicker";
import { FilterValuePicker } from "./FilterValuePicker";
import { FilterBadges } from "./FilterBadges";

interface FilterBarProps {
  config: FilterBarConfig;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  members?: FilterMember[];
  renderTrigger?: (props: {
    opened: boolean;
    onToggle: () => void;
    filtersActive: boolean;
  }) => React.ReactNode;
  onCopyMemberLink?: (memberId: string) => void;
}

export function FilterBar({
  config,
  filters,
  onFiltersChange,
  members,
  renderTrigger,
  onCopyMemberLink,
}: FilterBarProps) {
  const [opened, setOpened] = useState(false);
  const [activeField, setActiveField] = useState<FilterField | null>(null);

  const handleFieldSelect = useCallback((field: FilterField) => {
    setActiveField(field);
  }, []);

  const handleBack = useCallback(() => {
    setActiveField(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpened(false);
    setActiveField(null);
  }, []);

  const filtersActive = checkActiveFilters(config, filters);

  const clearAll = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  return (
    <Group gap="xs" wrap="wrap">
      <FilterBadges
        config={config}
        filters={filters}
        onFiltersChange={onFiltersChange}
        members={members}
      />

      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        width={260}
        shadow="md"
        radius="md"
        onClose={handleClose}
      >
        <Popover.Target>
          {renderTrigger
            ? renderTrigger({
                opened,
                onToggle: () => setOpened((o) => !o),
                filtersActive,
              })
            : (
              <Button
                variant="default"
                size="xs"
                radius="xl"
                leftSection={<IconPlus size={14} />}
                onClick={() => setOpened((o) => !o)}
                className="border-border-secondary"
              >
                Filter
              </Button>
            )}
        </Popover.Target>

        <Popover.Dropdown p={0}>
          {activeField ? (
            <>
              <Group
                gap="xs"
                className="border-b border-border-secondary px-3 py-2"
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={handleBack}
                  aria-label="Back to field picker"
                >
                  <IconArrowLeft size={14} />
                </ActionIcon>
                <Text size="sm" fw={500}>
                  {activeField.label}
                </Text>
              </Group>
              <FilterValuePicker
                field={activeField}
                filters={filters}
                onFiltersChange={onFiltersChange}
                members={members}
                onCopyMemberLink={onCopyMemberLink}
              />
            </>
          ) : (
            <FilterFieldPicker
              fields={config.fields}
              filters={filters}
              onFieldSelect={handleFieldSelect}
            />
          )}
        </Popover.Dropdown>
      </Popover>

      {filtersActive && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={clearAll}
          aria-label="Clear all filters"
        >
          <IconX size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}
