"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Group,
  Loader,
  MultiSelect,
  Select,
  Text,
  type ComboboxItem,
  type SelectProps,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { keepPreviousData } from "@tanstack/react-query";
import { api } from "~/trpc/react";

/**
 * Page size for the search query. These selects search server-side, so this is
 * the number of *matches* shown, not a cap on the searchable set — the whole
 * workspace is reachable by typing.
 */
const SEARCH_LIMIT = 50;

/**
 * Sentinel value of the synthetic "Create …" row appended to a creatable
 * select. Never a real record id, so it can't collide with one.
 */
const CREATE_OPTION_VALUE = "__create__";

interface Option {
  value: string;
  label: string;
}

interface RemoteSearchSelectProps {
  label: React.ReactNode;
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
  /**
   * When set, typing a name that matches no option offers a "Create …" row.
   * Picking it calls this with the typed name; the returned option becomes
   * the selection. Return null to leave the selection untouched (the caller
   * has already reported the failure).
   */
  onCreate?: (name: string) => Promise<Option | null>;
  /** Noun for the "Create …" row, e.g. "organization". */
  createLabel?: string;
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
  onCreate,
  createLabel = "record",
}: RemoteSearchSelectProps) {
  // The row the user picked, remembered so its label survives the next search
  // (which may no longer return it). Records that were already linked when the
  // form opened come in as `fallbackOption` instead.
  const [pickedOption, setPickedOption] = useState<Option | null>(null);
  // Raw (undebounced) search text, so the "Create …" row tracks what the user
  // is typing rather than what the server last matched on.
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const trimmedSearch = search.trim();
  const createRowLabel = `Create "${trimmedSearch}"`;

  const data = useMemo(() => {
    let rows = options;
    if (value && !options.some((o) => o.value === value)) {
      const pinned =
        pickedOption?.value === value ? pickedOption : fallbackOption;
      if (pinned?.value === value) rows = [pinned, ...rows];
    }
    // Offer creation only once the typed name matches nothing we already show,
    // so an exact match is picked rather than duplicated.
    const exactMatch = rows.some(
      (o) => o.label.trim().toLowerCase() === trimmedSearch.toLowerCase(),
    );
    if (onCreate && trimmedSearch.length > 0 && !exactMatch) {
      rows = [...rows, { value: CREATE_OPTION_VALUE, label: createRowLabel }];
    }
    return rows;
  }, [
    options,
    value,
    pickedOption,
    fallbackOption,
    onCreate,
    trimmedSearch,
    createRowLabel,
  ]);

  async function handleCreate(name: string) {
    if (!onCreate) return;
    setIsCreating(true);
    try {
      const created = await onCreate(name);
      if (created) {
        setPickedOption(created);
        onChange(created.value);
      }
    } finally {
      setIsCreating(false);
    }
  }

  function handleChange(next: string | null, option: ComboboxItem) {
    if (next === CREATE_OPTION_VALUE) {
      void handleCreate(trimmedSearch);
      return;
    }
    setPickedOption(next ? { value: next, label: option.label } : null);
    onChange(next);
  }

  // The label Mantine will echo back through onSearchChange for the current
  // selection: whichever of the three sources currently supplies its option.
  function labelFor(id: string): string | null {
    return (
      data.find((o) => o.value === id)?.label ??
      (pickedOption?.value === id ? pickedOption.label : null) ??
      (fallbackOption?.value === id ? fallbackOption.label : null)
    );
  }

  const selectedLabel = value ? labelFor(value) : null;

  function handleSearchChange(next: string) {
    // Picking the "Create …" row makes Mantine echo that row's label into the
    // search box. It is not something the user typed: forwarding it would
    // query the server for `Create "…"` and, if creation failed, leave the
    // typed name replaced by the row label. Keep the name instead.
    if (next === createRowLabel) return;
    // On close, Mantine re-seeds the search input with the selected option's
    // label. Forwarding that echo as a search term would re-query for the row
    // already selected, so reopening the dropdown would offer only that one
    // contact until the user cleared the box. Treat it as no search at all.
    const term = next === selectedLabel ? "" : next;
    setSearch(term);
    onSearchChange(term);
  }

  // The "Create …" row gets a plus icon so it reads as an action, not a match.
  const renderOption: SelectProps["renderOption"] = ({ option }) =>
    option.value === CREATE_OPTION_VALUE ? (
      <Group gap={6} wrap="nowrap">
        <IconPlus size={14} />
        <Text size="sm">
          Create {createLabel} &ldquo;{trimmedSearch}&rdquo;
        </Text>
      </Group>
    ) : (
      <Text size="sm">{option.label}</Text>
    );

  const busy = isFetching || isCreating;

  return (
    <Select
      label={label}
      placeholder={placeholder}
      data={data}
      value={value}
      onChange={handleChange}
      onSearchChange={handleSearchChange}
      filter={({ options }) => options}
      renderOption={renderOption}
      nothingFoundMessage={busy ? "Searching..." : "No matches"}
      rightSection={busy ? <Loader size="xs" /> : undefined}
      disabled={isCreating}
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
  /** Override the field label (defaults to the entity noun). */
  label?: React.ReactNode;
}

interface OrganizationSelectProps extends EntitySelectProps {
  /**
   * Let the user create an organization by typing its name and picking the
   * "Create …" row. The new record is selected on success.
   */
  creatable?: boolean;
}

export function ContactSelect({
  workspaceId,
  value,
  onChange,
  selectedOption,
  enabled = true,
  label = "Contact",
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
      label={label}
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
  label = "Organization",
  creatable = false,
}: OrganizationSelectProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const utils = api.useUtils();

  const { data, isFetching } = api.crmOrganization.getAll.useQuery(
    {
      workspaceId,
      search: debouncedSearch.trim() || undefined,
      limit: SEARCH_LIMIT,
    },
    { enabled, placeholderData: keepPreviousData },
  );

  const createOrganization = api.crmOrganization.create.useMutation({
    onSuccess: () => {
      void utils.crmOrganization.getAll.invalidate();
      void utils.crmOrganization.getStats.invalidate();
    },
  });

  async function handleCreate(name: string): Promise<Option | null> {
    try {
      // The "Create" row is offered against whatever page the debounced search
      // last returned, which can be a keystroke stale. Re-check the server for
      // an exact name before inserting, so a fast typist can't mint a
      // duplicate: an existing match is selected instead of created.
      const existing = await utils.crmOrganization.getAll.fetch({
        workspaceId,
        search: name,
        limit: SEARCH_LIMIT,
      });
      const match = existing.organizations.find(
        (o) => o.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        notifications.show({
          title: "Organization already exists",
          message: `Selected the existing "${match.name}".`,
          color: "blue",
        });
        return { value: match.id, label: match.name };
      }
      const org = await createOrganization.mutateAsync({ workspaceId, name });
      notifications.show({
        title: "Organization created",
        message: `"${org.name}" was added and selected.`,
        color: "green",
      });
      return { value: org.id, label: org.name };
    } catch (error) {
      notifications.show({
        title: "Could not create organization",
        message: error instanceof Error ? error.message : "Unknown error",
        color: "red",
      });
      return null;
    }
  }

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
      label={label}
      placeholder={
        creatable ? "Search or create an organization…" : "Search organizations"
      }
      value={value}
      onChange={onChange}
      options={options}
      fallbackOption={selectedOption}
      isFetching={isFetching}
      onSearchChange={setSearch}
      onCreate={creatable ? handleCreate : undefined}
      createLabel="organization"
    />
  );
}

interface ContactMultiSelectProps {
  workspaceId: string;
  value: string[];
  onChange: (value: string[]) => void;
  /**
   * Hide contacts already on this Collection. Handed to the server rather than
   * filtered here: with a well-populated list, its members can fill most of a
   * search page and leave almost nothing selectable.
   */
  excludeCollectionId?: string;
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
  excludeCollectionId,
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
      excludeCollectionId,
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
    const rows = [...results];
    // Selected contacts the current search doesn't return still need an option
    // to carry their label.
    const present = new Set(rows.map((o) => o.value));
    for (const id of value) {
      if (!present.has(id)) {
        rows.push({ value: id, label: labelCache[id] ?? "Selected contact" });
      }
    }
    return rows;
  }, [results, value, labelCache]);

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
