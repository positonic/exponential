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

/** A ceremony the picker can add an occurrence to, even with no tick in the window. */
export interface MeetingCeremonyOption {
  id: string;
  name: string;
}

const NONE_VALUE = "__none__";
const ADD_PREFIX = "__add__:";

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
  /** True while the candidate list is still loading. */
  loading?: boolean;
  /** Fires when the dropdown opens — lets callers fetch candidates lazily. */
  onOpen?: () => void;
  dropdownWidth?: number | "target";
  /**
   * The recurring ceremonies the caller may add occurrences to (owner, or
   * workspace admin). With `onAddOccurrence`, each gets a group — even with
   * no tick near the meeting — ending in an "Add occurrence" option, for the
   * meeting that was held off the cadence. A ceremony with ticks in the
   * window but not in this list shows its ticks only.
   */
  ceremonies?: MeetingCeremonyOption[];
  /** Create an occurrence of the ceremony at `addOccurrenceAt` and link the meeting to it. */
  onAddOccurrence?: (ceremonyId: string) => void;
  /** When the added occurrence would be: the meeting's own date. */
  addOccurrenceAt?: Date;
}

/**
 * Searchable picker for the meeting page's "Part of" row (ADR-0059): lists the
 * workspace's ceremony occurrences around the meeting date, grouped by
 * ceremony, with a "Not part of a ceremony" option that unlinks, and — when
 * the caller allows it — an "Add occurrence" option per ceremony for a
 * meeting held off the cadence (ADR-0059 amendment, 2026-10-21). Mirrors
 * `MeetingProjectPicker`: the caller owns persistence and the trigger.
 */
export function MeetingOccurrencePicker({
  occurrences,
  value,
  onChange,
  children,
  disabled = false,
  loading = false,
  onOpen,
  dropdownWidth = 280,
  ceremonies = [],
  onAddOccurrence,
  addOccurrenceAt,
}: MeetingOccurrencePickerProps) {
  const combobox = useCombobox({
    onDropdownOpen: () => onOpen?.(),
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const [search, setSearch] = useState("");

  const canAdd = Boolean(onAddOccurrence && addOccurrenceAt);
  const addable = useMemo(() => new Set(ceremonies.map((c) => c.id)), [ceremonies]);
  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matches = (name: string) => !q || name.toLowerCase().includes(q);
    // One group per ceremony, keyed by id: the ones with a tick in the window
    // first (in occurrence order), then — when adding is allowed — the rest.
    const byCeremony = new Map<string, { id: string; name: string; items: MeetingOccurrenceOption[] }>();
    for (const o of occurrences) {
      if (!matches(o.ceremonyName)) continue;
      const bucket = byCeremony.get(o.ceremonyId);
      if (bucket) bucket.items.push(o);
      else byCeremony.set(o.ceremonyId, { id: o.ceremonyId, name: o.ceremonyName, items: [o] });
    }
    if (canAdd) {
      for (const c of ceremonies) {
        if (!byCeremony.has(c.id) && matches(c.name)) byCeremony.set(c.id, { id: c.id, name: c.name, items: [] });
      }
    }
    return Array.from(byCeremony.values());
  }, [occurrences, ceremonies, canAdd, search]);

  return (
    <Combobox
      store={combobox}
      width={dropdownWidth}
      position="bottom-end"
      disabled={disabled}
      onOptionSubmit={(val) => {
        if (val.startsWith(ADD_PREFIX)) onAddOccurrence?.(val.slice(ADD_PREFIX.length));
        else onChange(val === NONE_VALUE ? null : val);
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
          {groups.map((group) => (
            <Combobox.Group key={group.id} label={group.name}>
              {group.items.map((o) => (
                <Combobox.Option key={o.id} value={o.id} active={value === o.id}>
                  <Text size="xs">{formatOccurrenceWhen(o.scheduledStart)}</Text>
                </Combobox.Option>
              ))}
              {canAdd && addOccurrenceAt && addable.has(group.id) && (
                <Combobox.Option
                  value={`${ADD_PREFIX}${group.id}`}
                  data-testid={`add-occurrence-${group.id}`}
                >
                  <Text size="xs" className="text-text-muted">
                    + Add occurrence at {formatOccurrenceWhen(addOccurrenceAt)}
                  </Text>
                </Combobox.Option>
              )}
            </Combobox.Group>
          ))}
          {groups.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">
                {loading ? "Loading ceremonies…" : "No ceremony occurrences around this date"}
              </Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
