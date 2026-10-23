"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
  Combobox,
  Group,
  Input,
  InputBase,
  Text,
  Tooltip,
  useCombobox,
  type InputBaseProps,
} from "@mantine/core";
import { IconCheck, IconUser } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { pillClassName } from "~/app/_components/product/PropertyPill";
import { getAvatarColor, getColorSeed, getInitial, getTextColor } from "~/utils/avatarColors";

export interface PickerUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Sentinel option value for "nobody" - Combobox values must be strings. */
const NONE = "__none__";

interface PersonPickerProps {
  /** Workspace whose people are offered. Null offers only the current user. */
  workspaceId: string | null | undefined;
  /** Selected user id, or null when nobody is assigned. */
  value: string | null;
  onChange: (userId: string | null, user: PickerUser | null) => void;
  /** Property name: "DRI", "Owner", "Assignee". Labels the trigger and the clear option. */
  label?: string;
  /**
   * The selected user as the caller already has them (e.g. `goal.driUser`).
   * Lets the trigger render without loading the member list, and keeps a
   * person who has since left the workspace displayable.
   */
  selectedUser?: PickerUser | null;
  /** Offer a "No <label>" option. */
  clearable?: boolean;
  /** Text for the unset state and the clear option. Defaults to "No <label>". */
  noneLabel?: string;
  disabled?: boolean;
  /**
   * `pill` - compact chip for property strips (detail pages, peeks, ticket modals).
   * `field` - labelled form input for modals that lay out a vertical form.
   */
  trigger?: "pill" | "field";
  /** `field` only: passed through to the input. */
  fieldProps?: Pick<InputBaseProps, "description" | "required" | "size" | "variant" | "mt" | "styles" | "classNames">;
  /** `field` only: shows the property label above the input. Defaults to true. */
  showFieldLabel?: boolean;
}

export function PersonAvatar({ user, size = 20 }: { user: PickerUser; size?: number }) {
  const background = user.image ? undefined : getAvatarColor(getColorSeed(user.name, user.email));
  return (
    <Avatar
      size={size}
      radius="xl"
      src={user.image}
      alt={user.name ?? user.email ?? "User"}
      styles={{
        root: { backgroundColor: background },
        placeholder: {
          backgroundColor: background,
          color: background ? getTextColor(background) : undefined,
          fontSize: Math.max(9, Math.round(size * 0.45)),
          fontWeight: 600,
        },
      }}
    >
      {getInitial(user.name, user.email)}
    </Avatar>
  );
}

function displayName(user: PickerUser): string {
  return user.name ?? user.email ?? "Unknown";
}

/**
 * The one picker for assigning a single person to something - a goal, key
 * result or project DRI, a ticket assignee, a ceremony owner. People come from
 * `workspace.listMembers` (direct and team-derived members), plus the current
 * user, who is always assignable and listed first.
 *
 * Multi-person assignment has its own pickers: `AssignActionModal` for action
 * assignees (Assistants and agent runs), `ParticipantPicker` for meetings.
 */
export function PersonPicker({
  workspaceId,
  value,
  onChange,
  label = "DRI",
  selectedUser,
  clearable = true,
  noneLabel,
  disabled = false,
  trigger = "pill",
  fieldProps,
  showFieldLabel = true,
}: PersonPickerProps) {
  const [search, setSearch] = useState("");
  const emptyText = noneLabel ?? `No ${label}`;
  const [hasOpened, setHasOpened] = useState(false);

  const combobox = useCombobox({
    onDropdownOpen: () => {
      setHasOpened(true);
      combobox.focusSearchInput();
    },
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });

  // Load the list only once someone opens the picker, unless the trigger
  // needs it to name the selected person.
  const needsMembers = hasOpened || (value != null && selectedUser?.id !== value);
  const { data: members } = api.workspace.listMembers.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId && needsMembers, staleTime: 5 * 60 * 1000 },
  );
  const { data: currentUser } = api.user.getCurrentUser.useQuery(undefined, {
    staleTime: Infinity,
  });

  const people = useMemo(() => {
    const byId = new Map<string, PickerUser>();
    if (currentUser) {
      byId.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name ?? null,
        email: currentUser.email ?? null,
        image: currentUser.image ?? null,
      });
    }
    for (const m of members ?? []) {
      if (!byId.has(m.id)) byId.set(m.id, { id: m.id, name: m.name, email: m.email, image: m.image });
    }
    return Array.from(byId.values());
  }, [currentUser, members]);

  const selected =
    value == null
      ? null
      : (people.find((p) => p.id === value) ?? (selectedUser?.id === value ? selectedUser : null));

  const query = search.trim().toLowerCase();
  const filtered = query
    ? people.filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(query) ||
          (p.email ?? "").toLowerCase().includes(query),
      )
    : people;

  const handleSubmit = (optionValue: string) => {
    combobox.closeDropdown();
    if (optionValue === NONE) {
      if (value !== null) onChange(null, null);
      return;
    }
    if (optionValue === value) return;
    onChange(optionValue, people.find((p) => p.id === optionValue) ?? null);
  };

  const toggle = () => {
    if (!disabled) combobox.toggleDropdown();
  };

  const targetNode =
    trigger === "pill" ? (
      <button
        type="button"
        className={pillClassName(!selected)}
        onClick={toggle}
        disabled={disabled}
        aria-label={selected ? `${label}: ${displayName(selected)}` : `Set ${label}`}
      >
        {selected ? <PersonAvatar user={selected} size={16} /> : <IconUser size={13} />}
        <span className="truncate">{selected ? displayName(selected) : label}</span>
      </button>
    ) : (
      <InputBase
        component="button"
        type="button"
        pointer
        label={showFieldLabel ? label : undefined}
        aria-label={showFieldLabel ? undefined : label}
        disabled={disabled}
        onClick={toggle}
        leftSection={selected ? <PersonAvatar user={selected} size={18} /> : <IconUser size={14} />}
        rightSection={<Combobox.Chevron />}
        rightSectionPointerEvents="none"
        {...fieldProps}
      >
        {selected ? (
          <span className="block truncate text-left">{displayName(selected)}</span>
        ) : (
          <Input.Placeholder>{emptyText}</Input.Placeholder>
        )}
      </InputBase>
    );

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={handleSubmit}
      withinPortal
      position="bottom-start"
      width={280}
      shadow="md"
    >
      <Combobox.Target targetType="button">
        {trigger === "pill" ? (
          <Tooltip label={label} position="top" openDelay={400} disabled={!selected}>
            {targetNode}
          </Tooltip>
        ) : (
          targetNode
        )}
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.updateSelectedOptionIndex();
          }}
          placeholder="Search people..."
        />
        <Combobox.Options mah={300} style={{ overflowY: "auto" }}>
          {clearable && !query && (
            <Combobox.Option value={NONE} active={value == null}>
              <Group gap="xs" wrap="nowrap">
                <IconUser size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-secondary">
                  {emptyText}
                </Text>
              </Group>
            </Combobox.Option>
          )}
          {filtered.map((person) => (
            <Combobox.Option key={person.id} value={person.id} active={person.id === value}>
              <Group gap="xs" wrap="nowrap">
                <PersonAvatar user={person} size={22} />
                <div className="min-w-0 flex-1">
                  <Text size="sm" truncate className="text-text-primary">
                    {displayName(person)}
                    {person.id === currentUser?.id && (
                      <Text span size="xs" className="text-text-muted">
                        {" "}
                        (you)
                      </Text>
                    )}
                  </Text>
                  {person.name && person.email && (
                    <Text size="xs" truncate className="text-text-muted">
                      {person.email}
                    </Text>
                  )}
                </div>
                {person.id === value && <IconCheck size={14} className="text-text-muted" />}
              </Group>
            </Combobox.Option>
          ))}
          {filtered.length === 0 && (
            <Combobox.Empty>{members || !workspaceId ? "Nobody found" : "Loading..."}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
