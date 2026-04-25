"use client";

import { Group, Badge, CloseButton } from "@mantine/core";
import type { FilterBarConfig, FilterState, FilterMember } from "~/types/filter";

interface FilterBadgesProps {
  config: FilterBarConfig;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  members?: FilterMember[];
}

export function FilterBadges({
  config,
  filters,
  onFiltersChange,
  members = [],
}: FilterBadgesProps) {
  const removeArrayValue = (key: string, value: string) => {
    const current = filters[key];
    if (!Array.isArray(current)) return;
    const updated = current.filter((v) => v !== value);
    onFiltersChange({
      ...filters,
      [key]: updated.length > 0 ? updated : undefined,
    });
  };

  const removeFilter = (key: string) => {
    const next = { ...filters };
    delete next[key];
    onFiltersChange(next);
  };

  const badges: React.ReactNode[] = [];

  for (const field of config.fields) {
    const val = filters[field.key];
    if (val === undefined) continue;

    const color = field.badgeColor ?? "blue";

    if (field.type === "boolean" && val === true) {
      badges.push(
        <Badge
          key={field.key}
          size="md"
          variant="light"
          color={color}
          rightSection={
            <CloseButton
              size="xs"
              onClick={() => removeFilter(field.key)}
              aria-label={`Remove ${field.label} filter`}
            />
          }
        >
          {field.label}
        </Badge>,
      );
    }

    if (Array.isArray(val) && val.length > 0) {
      for (const v of val) {
        let label = v;

        if (field.type === "multi-select") {
          label =
            field.options.find((o) => o.value === v)?.label ?? v;
        } else if (field.type === "user") {
          const member = members.find((m) => m.id === v);
          label = member?.name ?? member?.email ?? v;
        }

        badges.push(
          <Badge
            key={`${field.key}-${v}`}
            size="md"
            variant="light"
            color={color}
            rightSection={
              <CloseButton
                size="xs"
                onClick={() => removeArrayValue(field.key, v)}
                aria-label={`Remove ${label} filter`}
              />
            }
          >
            {field.label}: {label}
          </Badge>,
        );
      }
    }
  }

  if (badges.length === 0) return null;

  return (
    <Group gap="xs" role="list" aria-label="Active filters">
      {badges}
    </Group>
  );
}
