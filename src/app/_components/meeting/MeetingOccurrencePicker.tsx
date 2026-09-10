"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Combobox, Text, useCombobox } from "@mantine/core";

/** An occurrence option: one ceremony tick around the meeting's date. */
export interface MeetingOccurrenceOption {
  id: string;
  ceremonyId: string;
  ceremonyName: string;
  scheduledStart: Date;
}

const NONE_VALUE = "__none__";

const whenFmt: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

export function formatOccurrenceWhen(date: Date): string {
  return date.toLocaleString(undefined, whenFmt);
}

interface MeetingOccurrencePickerProps {
  /** Candidate occurrences (already workspace-scoped and date-windowed by the server). */
  occurrences: MeetingOccurrenceOption[];
  /** Currently linked occurrence id, or null when the meeting is not part of a ceremony. */
  value: string | null;
  /** Called with the chosen occurrence id, or null to unlink. */
  onChange: (occurrenceId: string | null) => void;
  /** Custom trigger — receives a `toggle` to open/close the dropdown. */
  children: (args: { toggle: () => void }) => ReactNode;
  disabled?: boolean;
  dropdownWidth?: number;
}

/**
 * Searchable picker for the meeting page's "Part of" row (ADR-0059): lists the
 * workspace's ceremony occurrences around the meeting date, grouped by
 * ceremony, with a "Not part of a ceremony" option that unlinks. Mirrors
 * `MeetingProjectPicker`: the caller owns persistence and the trigger.
 */
export function MeetingOccurrencePicker({
  occurrences,
  value,
  onChange,
  children,
  disabled = false,
  dropdownWidth = 280,
}: MeetingOccurrencePickerProps) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? occurrences.filter((o) => o.ceremonyName.toLowerCase().includes(q))
      : occurrences;
    const byCeremony = new Map<string, MeetingOccurrenceOption[]>();
    for (const o of filtered) {
      const bucket = byCeremony.get(o.ceremonyName);
      if (bucket) bucket.push(o);
      else byCeremony.set(o.ceremonyName, [o]);
    }
    return Array.from(byCeremony.entries());
  }, [occurrences, search]);

  return (
    <Combobox
      store={combobox}
      width={dropdownWidth}
      position="bottom-end"
      disabled={disabled}
      onOptionSubmit={(val) => {
        onChange(val === NONE_VALUE ? null : val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <div onClick={() => !disabled && combobox.toggleDropdown()}>
          {children({ toggle: () => !disabled && combobox.toggleDropdown() })}
        </div>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.updateSelectedOptionIndex();
          }}
          placeholder="Search ceremonies…"
          size="xs"
        />
        <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
          <Combobox.Option value={NONE_VALUE} active={value === null}>
            <Text size="xs" className="text-text-muted">
              Not part of a ceremony
            </Text>
          </Combobox.Option>
          {groups.map(([ceremonyName, items]) => (
            <Combobox.Group key={ceremonyName} label={ceremonyName}>
              {items.map((o) => (
                <Combobox.Option key={o.id} value={o.id} active={value === o.id}>
                  <Text size="xs">{formatOccurrenceWhen(o.scheduledStart)}</Text>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
          {groups.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">
                No ceremony occurrences around this date
              </Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
