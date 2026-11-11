"use client";

import { useMemo, useState } from "react";
import { MultiSelect, Select, UnstyledButton } from "@mantine/core";
import { pillTint } from "~/app/_components/listPage/pillTint";
import type { PropertyDef, SelectOption } from "~/lib/databases/schema";
import styles from "../DatabaseBlock.module.css";

const CREATE_PREFIX = "__create__:";

interface SelectCellProps {
  def: PropertyDef;
  /** The stored option id (select) or ids (multiSelect). */
  value: string | string[] | null | undefined;
  editable: boolean;
  onCommit: (next: string | string[] | null) => void;
  /**
   * Add an option to the property and resolve with its id; the cell then
   * selects it. Absent → no "Create" entry is offered.
   */
  onCreateOption?: (name: string) => Promise<string | null>;
}

function Pill({ option }: { option: SelectOption }) {
  return (
    <span className={styles.pill} style={pillTint(option.color)}>
      {option.name}
    </span>
  );
}

/**
 * Select and multi-select cells. Closed, a cell shows its options as tinted
 * pills (an empty cell a muted dash); activated, it swaps in a Mantine
 * Select/MultiSelect already open, the same lazy pattern as the list pages'
 * `PillSelect`, so a 200-row table does not mount 200 comboboxes. Typing a
 * name no option has offers to create it.
 */
export function SelectCell({ def, value, editable, onCommit, onCreateOption }: SelectCellProps) {
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState("");
  const options = useMemo(() => def.options ?? [], [def.options]);
  const multi = def.type === "multiSelect";
  const selectedIds = Array.isArray(value) ? value : value ? [String(value)] : [];
  const selected = selectedIds.map((id) => options.find((o) => o.id === id)).filter((o): o is SelectOption => !!o);

  const trimmed = search.trim();
  const canCreate =
    !!onCreateOption && trimmed.length > 0 && !options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());
  const data = [
    ...options.map((o) => ({ value: o.id, label: o.name })),
    ...(canCreate ? [{ value: `${CREATE_PREFIX}${trimmed}`, label: `Create "${trimmed}"` }] : []),
  ];

  const resolve = async (picked: string): Promise<string | null> => {
    if (!picked.startsWith(CREATE_PREFIX)) return picked;
    return (await onCreateOption?.(picked.slice(CREATE_PREFIX.length))) ?? null;
  };

  if (!active) {
    return (
      <UnstyledButton
        className={styles.pillButton}
        disabled={!editable}
        aria-label={def.name}
        onClick={(e) => {
          e.stopPropagation();
          if (editable) setActive(true);
        }}
        onKeyDown={(e) => {
          if (editable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.stopPropagation();
            setActive(true);
          }
        }}
      >
        {selected.length === 0 ? (
          <span className={styles.cellEmpty}>—</span>
        ) : (
          selected.map((o) => <Pill key={o.id} option={o} />)
        )}
      </UnstyledButton>
    );
  }

  const close = () => {
    setActive(false);
    setSearch("");
  };

  if (multi) {
    return (
      <MultiSelect
        size="xs"
        data={data}
        value={selectedIds}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        autoFocus
        defaultDropdownOpened
        aria-label={def.name}
        comboboxProps={{ withinPortal: true }}
        onDropdownClose={close}
        onChange={(next) => {
          void (async () => {
            const ids = (await Promise.all(next.map(resolve))).filter((id): id is string => !!id);
            onCommit(ids.length ? ids : null);
            setSearch("");
          })();
        }}
      />
    );
  }

  return (
    <Select
      size="xs"
      data={data}
      value={selectedIds[0] ?? null}
      searchable
      clearable
      searchValue={search}
      onSearchChange={setSearch}
      autoFocus
      defaultDropdownOpened
      aria-label={def.name}
      comboboxProps={{ withinPortal: true }}
      onDropdownClose={close}
      onChange={(next) => {
        void (async () => {
          const id = next === null ? null : await resolve(next);
          onCommit(id);
          close();
        })();
      }}
    />
  );
}
