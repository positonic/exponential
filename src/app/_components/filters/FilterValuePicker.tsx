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
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
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
  onCopyMemberLink?: (memberId: string) => void;
  /** Result count per option value; when provided, shown next to each option */
  counts?: Record<string, number>;
}

export function FilterValuePicker({
  field,
  filters,
  onFiltersChange,
  members = [],
  onCopyMemberLink,
  counts,
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
          counts={counts}
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
          onCopyMemberLink={onCopyMemberLink}
          counts={counts}
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
  counts,
}: {
  field: Extract<FilterField, { type: "multi-select" }>;
  selected: string[];
  onChange: (values: string[]) => void;
  counts?: Record<string, number>;
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
      <Stack gap={2} px={6} py={6}>
        {field.options.map((opt) => (
          <UnstyledButton
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              size="xs"
              tabIndex={-1}
              styles={{ input: { cursor: "pointer" } }}
            />
            <Text size="sm">{opt.label}</Text>
            {counts && (
              <Text size="xs" c="dimmed" ml="auto">
                {counts[opt.value] ?? 0}
              </Text>
            )}
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
  onCopyMemberLink,
  counts,
}: {
  field: Extract<FilterField, { type: "user" }>;
  selected: string[];
  onChange: (values: string[]) => void;
  members: FilterMember[];
  onCopyMemberLink?: (memberId: string) => void;
  counts?: Record<string, number>;
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
      <Stack gap={2} px={6} py={6}>
        {members.map((member) => (
          <Group
            key={member.id}
            gap={4}
            wrap="nowrap"
            className="rounded-md hover:bg-surface-hover"
          >
            <UnstyledButton
              onClick={() => toggle(member.id)}
              className="flex flex-1 items-center gap-2 px-2 py-1.5"
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
                {counts && (
                  <Text size="xs" c="dimmed">
                    {counts[member.id] ?? 0}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
            {onCopyMemberLink && (
              <Tooltip label="Copy link assigned to this person" position="left" withinPortal>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyMemberLink(member.id);
                  }}
                  aria-label={`Copy link assigned to ${member.name ?? member.email ?? "this person"}`}
                  className="mr-1"
                >
                  <IconLink size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
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
