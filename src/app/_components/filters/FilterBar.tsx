"use client";

import { useState, useCallback } from "react";
import { Group, Button, Popover, Text, ActionIcon } from "@mantine/core";
import { IconFilter, IconArrowLeft, IconX } from "@tabler/icons-react";
import type { FilterBarConfig, FilterField, FilterState, FilterMember } from "~/types/filter";
import { FilterFieldPicker } from "./FilterFieldPicker";
import { FilterValuePicker } from "./FilterValuePicker";
import { FilterBadges } from "./FilterBadges";

interface FilterBarProps {
  config: FilterBarConfig;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  members?: FilterMember[];
}

export function FilterBar({
  config,
  filters,
  onFiltersChange,
  members,
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

  const hasActiveFilters = config.fields.some((f) => {
    const val = filters[f.key];
    if (val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    return val === true;
  });

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
        width={240}
        shadow="md"
        onClose={handleClose}
      >
        <Popover.Target>
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconFilter size={14} />}
            onClick={() => setOpened((o) => !o)}
          >
            Filter
          </Button>
        </Popover.Target>

        <Popover.Dropdown p={0} className="border-border-primary">
          {activeField ? (
            <>
              <Group
                gap="xs"
                className="border-b border-border-primary px-2 py-2"
              >
                <ActionIcon
                  variant="subtle"
                  size="xs"
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

      {hasActiveFilters && (
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
