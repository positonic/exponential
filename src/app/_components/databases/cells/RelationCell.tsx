"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MultiSelect, Select, UnstyledButton } from "@mantine/core";
import type { RelationTarget } from "~/lib/databases/relations";
import type { PropertyDef } from "~/lib/databases/schema";
import styles from "../DatabaseBlock.module.css";

interface RelationCellProps {
  def: PropertyDef;
  /** The row's targets under this property, resolved by the server. */
  targets: readonly RelationTarget[];
  editable: boolean;
  /** The new target list, in order; empty clears the cell. */
  onCommit: (next: RelationTarget[]) => void;
  /** The picker's data source: targets whose title matches `query`. Absent → the cell is read-only. */
  onSearch?: (query: string) => Promise<RelationTarget[]>;
}

/** `IN_PROGRESS` → `in progress`, `on-track` → `on track`: native statuses as words. */
function humanStatus(status: string): string {
  return status.toLowerCase().replace(/[_-]+/g, " ");
}

function Pill({ target }: { target: RelationTarget }) {
  const label = (
    <>
      {target.deleted ? "(deleted)" : target.title}
      {target.status && !target.deleted ? (
        <span className={styles.relationStatus}>{humanStatus(target.status)}</span>
      ) : null}
    </>
  );
  return target.href && !target.deleted ? (
    <Link href={target.href} className={styles.relationPill} onClick={(e) => e.stopPropagation()}>
      {label}
    </Link>
  ) : (
    <span className={styles.relationPill} data-deleted={target.deleted ? "true" : undefined}>
      {label}
    </span>
  );
}

/**
 * A relation cell (ADR-0078 §5). Closed, one pill per target, linking to it
 * where the reader may open it — the target's current title and, for a
 * native entity, its live status, never a stored copy. Activated, it swaps
 * in a Mantine picker already open (the `SelectCell` pattern) fed by
 * `onSearch`: rows of the related database or entities of the target kind,
 * searched by title. A single-valued relation picks one; others pick many.
 */
export function RelationCell({ def, targets, editable, onCommit, onSearch }: RelationCellProps) {
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<RelationTarget[]>([]);
  const latest = useRef(0);
  const many = def.relation?.many ?? true;
  const canEdit = editable && !!onSearch;

  // Every target the picker has seen, so a pick resolves to a whole target
  // (title, href) before the server confirms it.
  const known = useMemo(() => {
    const map = new Map<string, RelationTarget>();
    for (const t of targets) map.set(t.id, t);
    for (const t of results) map.set(t.id, t);
    return map;
  }, [targets, results]);

  useEffect(() => {
    if (!active || !onSearch) return;
    const call = ++latest.current;
    void onSearch(search).then((found) => {
      if (call === latest.current) setResults(found);
    });
  }, [active, search, onSearch]);

  if (!active) {
    const pills =
      targets.length === 0 ? (
        <span className={styles.cellEmpty}>—</span>
      ) : (
        targets.map((t) => <Pill key={`${t.kind}:${t.id}`} target={t} />)
      );
    if (!canEdit) return <span className={styles.pillButton}>{pills}</span>;
    return (
      <UnstyledButton
        className={styles.pillButton}
        aria-label={def.name}
        onClick={(e) => {
          e.stopPropagation();
          setActive(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setActive(true);
          }
        }}
      >
        {pills}
      </UnstyledButton>
    );
  }

  const close = () => {
    setActive(false);
    setSearch("");
  };
  const selectedIds = targets.filter((t) => !t.deleted).map((t) => t.id);
  const data = [...known.values()]
    .filter((t) => !t.deleted)
    .map((t) => ({ value: t.id, label: t.status ? `${t.title} · ${humanStatus(t.status)}` : t.title }));
  const pick = (ids: string[]) => ids.map((id) => known.get(id)).filter((t): t is RelationTarget => !!t);

  if (many) {
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
        nothingFoundMessage="Nothing matches"
        comboboxProps={{ withinPortal: true }}
        onDropdownClose={close}
        onChange={(next) => {
          onCommit(pick(next));
          setSearch("");
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
      nothingFoundMessage="Nothing matches"
      comboboxProps={{ withinPortal: true }}
      onDropdownClose={close}
      onChange={(next) => {
        onCommit(next === null ? [] : pick([next]));
        close();
      }}
    />
  );
}
