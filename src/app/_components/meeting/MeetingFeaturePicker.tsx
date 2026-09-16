"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Combobox, Group, Text, useCombobox } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import {
  ARCHIVED_FEATURE_STATUS,
  FEATURE_STATUS_LABELS,
} from "~/lib/feature-statuses";

/** A feature option, grouped by its product in the dropdown. */
export interface MeetingFeatureOption {
  id: string;
  name: string;
  status: string;
  productName: string;
}

interface MeetingFeaturePickerProps {
  /** Candidate features (the meeting's workspace, across its products). */
  features: MeetingFeatureOption[];
  /** Ids of the features currently linked. */
  value: string[];
  /** Called with a feature id and whether it should now be linked. */
  onToggle: (featureId: string, linked: boolean) => void;
  /** Custom trigger — receives a `toggle` to open/close the dropdown. */
  children: (args: { toggle: () => void }) => ReactNode;
  disabled?: boolean;
  /** True while the candidate list is still loading. */
  loading?: boolean;
  /** Fires when the dropdown opens — lets callers fetch candidates lazily. */
  onOpen?: () => void;
  dropdownWidth?: number | "target";
  position?: "bottom-start" | "bottom-end";
}

/**
 * Searchable multi-select for the Features a meeting discussed, grouped by
 * product. Picking an option toggles it and keeps the dropdown open, so several
 * can be linked in one go. Archived features are hidden unless already linked.
 * Mirrors `MeetingProjectPicker`: the caller owns persistence and the trigger.
 */
export function MeetingFeaturePicker({
  features,
  value,
  onToggle,
  children,
  disabled = false,
  loading = false,
  onOpen,
  dropdownWidth = 280,
  position = "bottom-end",
}: MeetingFeaturePickerProps) {
  const combobox = useCombobox({
    onDropdownOpen: () => onOpen?.(),
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const byProduct = new Map<string, MeetingFeatureOption[]>();
    for (const f of features) {
      if (f.status === ARCHIVED_FEATURE_STATUS && !selected.has(f.id)) continue;
      if (q && !f.name.toLowerCase().includes(q)) continue;
      const bucket = byProduct.get(f.productName);
      if (bucket) bucket.push(f);
      else byProduct.set(f.productName, [f]);
    }
    return Array.from(byProduct.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [features, search, selected]);

  const toggleDropdown = () => {
    if (!disabled) combobox.toggleDropdown();
  };

  return (
    <Combobox
      store={combobox}
      width={dropdownWidth}
      position={position}
      disabled={disabled}
      onOptionSubmit={(id) => onToggle(id, !selected.has(id))}
    >
      <Combobox.Target>
        <div onClick={toggleDropdown}>{children({ toggle: toggleDropdown })}</div>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.updateSelectedOptionIndex();
          }}
          placeholder="Search features…"
          size="xs"
        />
        <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
          {groups.map(([productName, items]) => (
            <Combobox.Group key={productName} label={productName}>
              {items.map((f) => (
                <Combobox.Option key={f.id} value={f.id} active={selected.has(f.id)}>
                  <Group gap={6} wrap="nowrap" justify="space-between">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <span style={{ width: 12, flexShrink: 0 }}>
                        {selected.has(f.id) && <IconCheck size={12} />}
                      </span>
                      <Text size="xs" truncate>
                        {f.name}
                      </Text>
                    </Group>
                    <Text size="xs" className="shrink-0 text-text-muted">
                      {FEATURE_STATUS_LABELS[f.status] ?? f.status}
                    </Text>
                  </Group>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
          {groups.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">
                {loading
                  ? "Loading features…"
                  : features.length === 0
                    ? "No features in this workspace"
                    : "No matching features"}
              </Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
