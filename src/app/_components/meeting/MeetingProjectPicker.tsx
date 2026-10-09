"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Combobox, Group, Text, useCombobox } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";

/** A project option, grouped by its workspace in the dropdown. */
export interface MeetingProjectOption {
  id: string;
  name: string;
  /** Null for personal (workspace-less) projects. */
  workspaceId: string | null;
  workspaceName: string | null;
  /** Shows a lock — restricted projects are visible to their members only. */
  isRestricted?: boolean;
}

const NONE_VALUE = "__none__";
const PERSONAL_GROUP = "Personal";

interface MeetingProjectPickerProps {
  /** Candidate projects (already edit-scoped + sorted by the server). */
  projects: MeetingProjectOption[];
  /** Currently placed project id, or null for Personal / no project. */
  value: string | null;
  /** Called with the chosen project id, or null to clear placement. */
  onChange: (projectId: string | null) => void;
  /** Custom trigger — receives a `toggle` to open/close the dropdown. */
  children: (args: { toggle: () => void }) => ReactNode;
  /** Label for the clear-placement option. */
  noneLabel?: string;
  /** Offer the clear-placement option. Off when the caller knows clearing
   * would be rejected (e.g. detaching a page needs workspace membership). */
  allowNone?: boolean;
  dropdownWidth?: number | "target";
  /** True while the candidate list is still loading. */
  loading?: boolean;
  /** Fires when the dropdown opens — lets callers fetch candidates lazily. */
  onOpen?: () => void;
  /** Render the dropdown in a portal (default). Pass false inside a Popover,
   * where a portalled dropdown counts as an outside click and closes it. */
  withinPortal?: boolean;
}

/**
 * Searchable project picker for placing a meeting, grouped by workspace, with a
 * "Personal / no project" option that clears placement. The caller owns
 * persistence via `onChange` and renders its own trigger via `children` so the
 * picker can be reused from the meetings list row, the bulk bar, and the
 * meeting detail page.
 */
export function MeetingProjectPicker({
  projects,
  value,
  onChange,
  children,
  noneLabel = "Personal / no project",
  allowNone = true,
  dropdownWidth = 260,
  loading = false,
  onOpen,
  withinPortal = true,
}: MeetingProjectPickerProps) {
  const combobox = useCombobox({
    onDropdownOpen: () => onOpen?.(),
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q))
      : projects;
    // Preserve the server's sort order while bucketing by workspace.
    const byGroup = new Map<string, MeetingProjectOption[]>();
    for (const p of filtered) {
      const key = p.workspaceName ?? PERSONAL_GROUP;
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(p);
      else byGroup.set(key, [p]);
    }
    return Array.from(byGroup.entries());
  }, [projects, search]);

  return (
    <Combobox
      store={combobox}
      width={dropdownWidth}
      position="bottom-end"
      withinPortal={withinPortal}
      onOptionSubmit={(val) => {
        onChange(val === NONE_VALUE ? null : val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <div onClick={() => combobox.toggleDropdown()}>
          {children({ toggle: () => combobox.toggleDropdown() })}
        </div>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.updateSelectedOptionIndex();
          }}
          placeholder="Search projects…"
          size="xs"
        />
        <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
          {allowNone && (
            <Combobox.Option value={NONE_VALUE} active={value === null}>
              <Text size="xs" className="text-text-muted">
                {noneLabel}
              </Text>
            </Combobox.Option>
          )}
          {groups.map(([groupName, items]) => (
            <Combobox.Group key={groupName} label={groupName}>
              {items.map((p) => (
                <Combobox.Option key={p.id} value={p.id} active={value === p.id}>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs">{p.name}</Text>
                    {p.isRestricted ? (
                      <IconLock
                        size={12}
                        className="shrink-0 text-text-muted"
                        aria-label="Restricted"
                      />
                    ) : null}
                  </Group>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
          {groups.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">
                {loading ? "Loading projects…" : "No matching projects"}
              </Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
