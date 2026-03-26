"use client";

import {
  Stack,
  Checkbox,
  Switch,
  UnstyledButton,
  Group,
  Text,
  Avatar,
  ScrollArea,
} from "@mantine/core";
import type {
  FilterField,
  FilterState,
  FilterMember,
} from "~/types/filter";
import { getAvatarColor, getInitial } from "~/utils/avatarColors";

interface FilterValuePickerProps {
  field: FilterField;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  members?: FilterMember[];
}

export function FilterValuePicker({
  field,
  filters,
  onFiltersChange,
  members = [],
}: FilterValuePickerProps) {
  switch (field.type) {
    case "multi-select":
      return (
        <MultiSelectPicker
          field={field}
          selected={(filters[field.key] as string[] | undefined) ?? []}
          onChange={(values) =>
            onFiltersChange({
              ...filters,
              [field.key]: values.length > 0 ? values : undefined,
            })
          }
        />
      );
    case "user":
      return (
        <UserPicker
          field={field}
          selected={(filters[field.key] as string[] | undefined) ?? []}
          onChange={(values) =>
            onFiltersChange({
              ...filters,
              [field.key]: values.length > 0 ? values : undefined,
            })
          }
          members={members}
        />
      );
    case "boolean":
      return (
        <BooleanPicker
          field={field}
          checked={(filters[field.key] as boolean | undefined) ?? false}
          onChange={(checked) =>
            onFiltersChange({
              ...filters,
              [field.key]: checked || undefined,
            })
          }
        />
      );
  }
}

function MultiSelectPicker({
  field,
  selected,
  onChange,
}: {
  field: Extract<FilterField, { type: "multi-select" }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <ScrollArea.Autosize mah={280}>
      <Stack gap={0} py={4}>
        {field.options.map((opt) => (
          <UnstyledButton
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className="flex items-center gap-2 rounded px-3 py-2 hover:bg-surface-hover"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              size="xs"
              tabIndex={-1}
              styles={{ input: { cursor: "pointer" } }}
            />
            <Text size="sm">{opt.label}</Text>
          </UnstyledButton>
        ))}
      </Stack>
    </ScrollArea.Autosize>
  );
}

function UserPicker({
  field: _field,
  selected,
  onChange,
  members,
}: {
  field: Extract<FilterField, { type: "user" }>;
  selected: string[];
  onChange: (values: string[]) => void;
  members: FilterMember[];
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (members.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No workspace members
      </Text>
    );
  }

  return (
    <ScrollArea.Autosize mah={280}>
      <Stack gap={0} py={4}>
        {members.map((member) => (
          <UnstyledButton
            key={member.id}
            onClick={() => toggle(member.id)}
            className="flex items-center gap-2 rounded px-3 py-2 hover:bg-surface-hover"
          >
            <Checkbox
              checked={selected.includes(member.id)}
              onChange={() => toggle(member.id)}
              size="xs"
              tabIndex={-1}
              styles={{ input: { cursor: "pointer" } }}
            />
            <Group gap="xs" wrap="nowrap">
              <Avatar
                src={member.image}
                size="xs"
                radius="xl"
                color={getAvatarColor(member.id)}
              >
                {getInitial(member.name ?? member.email)}
              </Avatar>
              <Text size="sm" truncate>
                {member.name ?? member.email ?? "Unknown"}
              </Text>
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </ScrollArea.Autosize>
  );
}

function BooleanPicker({
  field,
  checked,
  onChange,
}: {
  field: Extract<FilterField, { type: "boolean" }>;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="px-3 py-3">
      <Switch
        label={field.label}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        size="sm"
      />
    </div>
  );
}
