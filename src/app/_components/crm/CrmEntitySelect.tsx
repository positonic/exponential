"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader,
  MultiSelect,
  Select,
  type ComboboxItem,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData } from "@tanstack/react-query";
import { api } from "~/trpc/react";

/**
 * Page size for the search query. These selects search server-side, so this is
 * the number of *matches* shown, not a cap on the searchable set — the whole
 * workspace is reachable by typing.
 */
const SEARCH_LIMIT = 50;

interface Option {
  value: string;
  label: string;
}

interface RemoteSearchSelectProps {
  label: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Option[];
  /**
   * Label for `value` when the row isn't in `options` — an already-linked
   * record the current search doesn't match, or one outside the first page.
   */
  fallbackOption?: Option | null;
  isFetching: boolean;
  onSearchChange: (search: string) => void;
}

/**
 * A Mantine Select whose options come from a server-side search rather than a
 * prefetched list. Client-side filtering is disabled: the server has already
 * matched, and re-filtering on the label would drop rows it matched on other
 * terms.
 */
function RemoteSearchSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  fallbackOption,
  isFetching,
  onSearchChange,
}: RemoteSearchSelectProps) {
  // The row the user picked, remembered so its label survives the next search
  // (which may no longer return it). Records that were already linked when the
  // form opened come in as `fallbackOption` instead.
  const [pickedOption, setPickedOption] = useState<Option | null>(null);

  const data = useMemo(() => {
    if (!value || options.some((o) => o.value === value)) return options;
    const pinned = pickedOption?.value === value ? pickedOption : fallbackOption;
    return pinned?.value === value ? [pinned, ...options] : options;
  }, [options, value, pickedOption, fallbackOption]);

  function handleChange(next: string | null, option: ComboboxItem) {
    setPickedOption(next ? { value: next, label: option.label } : null);
    onChange(next);
  }

  return (
    <Select
      label={label}
      placeholder={placeholder}
      data={data}
      value={value}
      onChange={handleChange}
      onSearchChange={onSearchChange}
      filter={({ options }) => options}
      nothingFoundMessage={isFetching ? "Searching..." : "No matches"}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      searchable
      clearable
    />
  );
}

interface EntitySelectProps {
  workspaceId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** The already-linked record, so it stays selectable and labelled. */
  selectedOption?: Option | null;
  /** Skip the query until the form using it is actually visible. */
  enabled?: boolean;
}

export function ContactSelect({
  workspaceId,
  value,
  onChange,
  selectedOption,
  enabled = true,
}: EntitySelectProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);

  // Note: contact emails are encrypted at rest, so the server matches on first
  // and last name only.
  const { data, isFetching } = api.crmContact.getAll.useQuery(
    {
      workspaceId,
      search: debouncedSearch.trim() || undefined,
      limit: SEARCH_LIMIT,
    },
    { enabled, placeholderData: keepPreviousData },
  );

  const options = useMemo(
    () =>
      (data?.contacts ?? []).map((c) => ({
        value: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed",
      })),
    [data?.contacts],
  );

  return (
    <RemoteSearchSelect
      label="Contact"
      placeholder="Search contacts"
      value={value}
      onChange={onChange}
      options={options}
      fallbackOption={selectedOption}
      isFetching={isFetching}
      onSearchChange={setSearch}
    />
  );
}

export function OrganizationSelect({
  workspaceId,
  value,
  onChange,
  selectedOption,
  enabled = true,
}: EntitySelectProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);

  const { data, isFetching } = api.crmOrganization.getAll.useQuery(
    {
      workspaceId,
      search: debouncedSearch.trim() || undefined,
      limit: SEARCH_LIMIT,
    },
    { enabled, placeholderData: keepPreviousData },
  );

  const options = useMemo(
    () =>
      (data?.organizations ?? []).map((o) => ({
        value: o.id,
        label: o.name,
      })),
    [data?.organizations],
  );

  return (
    <RemoteSearchSelect
      label="Organization"
      placeholder="Search organizations"
      value={value}
      onChange={onChange}
      options={options}
      fallbackOption={selectedOption}
      isFetching={isFetching}
      onSearchChange={setSearch}
    />
  );
}

interface ContactMultiSelectProps {
  workspaceId: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Contacts to hide from results — e.g. the ones already on the list. */
  excludeIds?: string[];
  label?: string;
  placeholder?: string;
  enabled?: boolean;
  style?: React.CSSProperties;
}

/**
 * Multi-select over the workspace's contacts, searched server-side. Labels of
 * already-picked contacts are cached, so their pills stay readable after a
 * later search stops returning them.
 */
export function ContactMultiSelect({
  workspaceId,
  value,
  onChange,
  excludeIds,
  label = "Add contacts",
  placeholder = "Search contacts…",
  enabled = true,
  style,
}: ContactMultiSelectProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [labelCache, setLabelCache] = useState<Record<string, string>>({});

  const { data, isFetching } = api.crmContact.getAll.useQuery(
    {
      workspaceId,
      search: debouncedSearch.trim() || undefined,
      limit: SEARCH_LIMIT,
    },
    { enabled, placeholderData: keepPreviousData },
  );

  const results = useMemo(
    () =>
      (data?.contacts ?? []).map((c) => ({
        value: c.id,
        label:
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
          "Unnamed contact",
      })),
    [data?.contacts],
  );

  // Remember every label seen, so a pill picked three searches ago doesn't
  // degrade into a raw id. Bailing out when nothing changed keeps this from
  // looping on its own state update.
  useEffect(() => {
    setLabelCache((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const option of results) {
        if (next[option.value] !== option.label) {
          next[option.value] = option.label;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [results]);

  const options = useMemo(() => {
    const excluded = new Set(excludeIds ?? []);
    const rows = results.filter(
      (o) => !excluded.has(o.value) || value.includes(o.value),
    );
    // Selected contacts the current search doesn't return still need an option
    // to carry their label.
    const present = new Set(rows.map((o) => o.value));
    for (const id of value) {
      if (!present.has(id)) {
        rows.push({ value: id, label: labelCache[id] ?? "Selected contact" });
      }
    }
    return rows;
  }, [results, excludeIds, value, labelCache]);

  return (
    <MultiSelect
      label={label}
      placeholder={placeholder}
      data={options}
      value={value}
      onChange={onChange}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage={isFetching ? "Searching..." : "No matching contacts"}
      searchable
      clearable
      style={style}
    />
  );
}
