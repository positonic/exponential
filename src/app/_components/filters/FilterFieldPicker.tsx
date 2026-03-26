"use client";

import { useState } from "react";
import { TextInput, Stack, UnstyledButton, Group, Text, ScrollArea } from "@mantine/core";
import { IconSearch, IconCheck } from "@tabler/icons-react";
import type { FilterField, FilterState } from "~/types/filter";

interface FilterFieldPickerProps {
  fields: FilterField[];
  filters: FilterState;
  onFieldSelect: (field: FilterField) => void;
}

export function FilterFieldPicker({
  fields,
  filters,
  onFieldSelect,
}: FilterFieldPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = fields.filter((f) =>
    f.label.toLowerCase().includes(search.toLowerCase()),
  );

  const hasValue = (field: FilterField): boolean => {
    const val = filters[field.key];
    if (val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    return val === true;
  };

  return (
    <Stack gap={0}>
      <TextInput
        placeholder="Filter by..."
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        size="sm"
        variant="unstyled"
        className="border-b border-border-primary px-2"
      />
      <ScrollArea.Autosize mah={280}>
        <Stack gap={0} py={4}>
          {filtered.map((field) => {
            const Icon = field.icon;
            const active = hasValue(field);
            return (
              <UnstyledButton
                key={field.key}
                onClick={() => onFieldSelect(field)}
                className="flex items-center gap-2 rounded px-3 py-2 hover:bg-surface-hover"
              >
                <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                  {Icon && (
                    <Icon
                      size={16}
                      className="text-text-muted"
                    />
                  )}
                  <Text size="sm">{field.label}</Text>
                </Group>
                {active && (
                  <IconCheck size={14} className="text-brand-primary" />
                )}
              </UnstyledButton>
            );
          })}
          {filtered.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="sm">
              No matching filters
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
