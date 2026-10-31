"use client";

import { useState } from "react";
import { ActionIcon, Checkbox, Popover, Select, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconArrowsSort, IconEyeOff, IconFilter, IconPlus, IconX } from "@tabler/icons-react";
import type { DatabaseView, Filter, FilterOp, PropertyDef, PropertyType } from "~/lib/databases/schema";
import styles from "./DatabaseBlock.module.css";

/** The filter ops each property type takes — the same set `compileRowQuery` accepts. */
export const FILTER_OPS_BY_TYPE: Record<PropertyType, FilterOp[]> = {
  title: ["contains", "eq", "neq", "isEmpty", "isNotEmpty"],
  text: ["contains", "eq", "neq", "isEmpty", "isNotEmpty"],
  url: ["contains", "eq", "neq", "isEmpty", "isNotEmpty"],
  number: ["eq", "neq", "gt", "lt", "isEmpty", "isNotEmpty"],
  date: ["eq", "before", "after", "isEmpty", "isNotEmpty"],
  checkbox: ["eq"],
  select: ["eq", "neq", "anyOf", "isEmpty", "isNotEmpty"],
  multiSelect: ["eq", "anyOf", "isEmpty", "isNotEmpty"],
  person: ["eq", "anyOf", "isEmpty", "isNotEmpty"],
  relation: ["isEmpty", "isNotEmpty"],
  createdTime: ["before", "after"],
  lastEditedTime: ["before", "after"],
  createdBy: ["eq", "anyOf"],
};

const OP_LABELS: Record<FilterOp, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  gt: ">",
  lt: "<",
  before: "before",
  after: "after",
  anyOf: "is any of",
};

const NO_VALUE: ReadonlySet<FilterOp> = new Set(["isEmpty", "isNotEmpty"]);

interface ViewControlsProps {
  properties: PropertyDef[];
  view: DatabaseView;
  /** Replace the saved view whole. */
  onChangeView: (next: DatabaseView) => void;
}

const dropdownStyles = {
  dropdown: {
    backgroundColor: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-primary)",
    minWidth: 260,
    maxWidth: 360,
  },
};

function ControlButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      className={styles.controlButton}
      data-active={active ? "true" : "false"}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </UnstyledButton>
  );
}

/** The value a filter takes, typed by the property: a select picks an option, a checkbox yes/no, else text. */
function FilterValue({ def, filter, onChange }: { def: PropertyDef; filter: Filter; onChange: (value: unknown) => void }) {
  if (NO_VALUE.has(filter.op)) return null;
  if (def.type === "checkbox") {
    return (
      <Select
        size="xs"
        data={[
          { value: "true", label: "Checked" },
          { value: "false", label: "Unchecked" },
        ]}
        value={filter.value === false ? "false" : "true"}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        onChange={(v) => onChange(v === "true")}
        aria-label="Value"
      />
    );
  }
  if ((def.type === "select" || def.type === "multiSelect") && def.options?.length) {
    const data = def.options.map((o) => ({ value: o.id, label: o.name }));
    if (filter.op === "anyOf") {
      const selected = Array.isArray(filter.value) ? (filter.value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {def.options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  on ? "bg-brand-primary text-white" : "bg-surface-hover text-text-muted hover:text-text-primary"
                }`}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <Select
        size="xs"
        data={data}
        value={typeof filter.value === "string" ? filter.value : null}
        comboboxProps={{ withinPortal: true }}
        onChange={(v) => onChange(v)}
        aria-label="Value"
      />
    );
  }
  return (
    <TextInput
      size="xs"
      value={typeof filter.value === "string" || typeof filter.value === "number" ? String(filter.value) : ""}
      placeholder={def.type === "date" ? "YYYY-MM-DD" : "Value"}
      onChange={(e) => onChange(e.currentTarget.value)}
      aria-label="Value"
    />
  );
}

/**
 * The block header's view controls (ADR-0078 §6): one saved table view —
 * sort, filters and hidden columns — edited in popovers and saved whole on
 * the block. Column order and widths are edited on the header itself.
 */
export function ViewControls({ properties, view, onChangeView }: ViewControlsProps) {
  const [open, setOpen] = useState<"sort" | "filter" | "hide" | null>(null);
  const byId = new Map(properties.map((p) => [p.id, p]));
  const sortable = properties.filter((p) => p.type !== "relation");
  const hideable = properties.filter((p) => p.type !== "title");
  const filterable = properties.filter((p) => FILTER_OPS_BY_TYPE[p.type].length > 0);

  const setFilters = (filters: Filter[]) => onChangeView({ ...view, filters });
  const updateFilter = (index: number, patch: Partial<Filter>) =>
    setFilters(view.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <div className={styles.controls}>
      <Popover opened={open === "sort"} onChange={(o) => setOpen(o ? "sort" : null)} position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <div>
            <ControlButton
              active={!!view.sort}
              label={view.sort ? `Sort: ${byId.get(view.sort.propertyId)?.name ?? "?"}` : "Sort"}
              icon={<IconArrowsSort size={13} />}
              onClick={() => setOpen(open === "sort" ? null : "sort")}
            />
          </div>
        </Popover.Target>
        <Popover.Dropdown styles={dropdownStyles} onKeyDown={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <Text size="xs" fw={600} className="text-text-primary">
              Sort
            </Text>
            <Select
              size="xs"
              label="Property"
              data={sortable.map((p) => ({ value: p.id, label: p.name }))}
              value={view.sort?.propertyId ?? null}
              clearable
              comboboxProps={{ withinPortal: true }}
              onChange={(propertyId) =>
                onChangeView({
                  ...view,
                  sort: propertyId ? { propertyId, direction: view.sort?.direction ?? "asc" } : undefined,
                })
              }
            />
            <Select
              size="xs"
              label="Direction"
              data={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              value={view.sort?.direction ?? "asc"}
              disabled={!view.sort}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(direction) =>
                view.sort && direction
                  ? onChangeView({ ...view, sort: { ...view.sort, direction: direction as "asc" | "desc" } })
                  : undefined
              }
            />
          </div>
        </Popover.Dropdown>
      </Popover>

      <Popover opened={open === "filter"} onChange={(o) => setOpen(o ? "filter" : null)} position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <div>
            <ControlButton
              active={view.filters.length > 0}
              label={view.filters.length ? `Filter (${view.filters.length})` : "Filter"}
              icon={<IconFilter size={13} />}
              onClick={() => setOpen(open === "filter" ? null : "filter")}
            />
          </div>
        </Popover.Target>
        <Popover.Dropdown styles={dropdownStyles} onKeyDown={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Text size="xs" fw={600} className="text-text-primary">
                Filters
              </Text>
              {view.filters.length > 0 ? (
                <UnstyledButton onClick={() => setFilters([])} className="text-[10px] text-text-muted hover:text-text-primary">
                  Clear all
                </UnstyledButton>
              ) : null}
            </div>
            {view.filters.map((filter, index) => {
              const def = byId.get(filter.propertyId);
              const ops = def ? FILTER_OPS_BY_TYPE[def.type] : [];
              return (
                <div key={index} className="flex flex-col gap-1 rounded-md border border-border-secondary p-2">
                  <div className="flex items-center gap-1">
                    <Select
                      size="xs"
                      className="flex-1"
                      data={filterable.map((p) => ({ value: p.id, label: p.name }))}
                      value={filter.propertyId}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true }}
                      aria-label="Property"
                      onChange={(propertyId) => {
                        if (!propertyId) return;
                        const next = byId.get(propertyId);
                        const firstOp = next ? FILTER_OPS_BY_TYPE[next.type][0]! : "eq";
                        updateFilter(index, { propertyId, op: firstOp, value: undefined });
                      }}
                    />
                    <Select
                      size="xs"
                      className="flex-1"
                      data={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                      value={filter.op}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true }}
                      aria-label="Condition"
                      onChange={(op) => op && updateFilter(index, { op: op as FilterOp, value: undefined })}
                    />
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label="Remove filter"
                      onClick={() => setFilters(view.filters.filter((_, i) => i !== index))}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </div>
                  {def ? <FilterValue def={def} filter={filter} onChange={(value) => updateFilter(index, { value })} /> : null}
                </div>
              );
            })}
            <UnstyledButton
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              aria-label="Add filter"
              onClick={() => {
                const first = filterable[0];
                if (!first) return;
                setFilters([...view.filters, { propertyId: first.id, op: FILTER_OPS_BY_TYPE[first.type][0]! }]);
              }}
            >
              <IconPlus size={12} /> Add filter
            </UnstyledButton>
          </div>
        </Popover.Dropdown>
      </Popover>

      <Popover opened={open === "hide"} onChange={(o) => setOpen(o ? "hide" : null)} position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <div>
            <ControlButton
              active={view.hiddenPropertyIds.length > 0}
              label={view.hiddenPropertyIds.length ? `Hidden (${view.hiddenPropertyIds.length})` : "Hide"}
              icon={<IconEyeOff size={13} />}
              onClick={() => setOpen(open === "hide" ? null : "hide")}
            />
          </div>
        </Popover.Target>
        <Popover.Dropdown styles={dropdownStyles} onKeyDown={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <Text size="xs" fw={600} className="text-text-primary">
              Columns
            </Text>
            {hideable.map((p) => {
              const hidden = view.hiddenPropertyIds.includes(p.id);
              return (
                <Checkbox
                  key={p.id}
                  size="xs"
                  label={p.name}
                  checked={!hidden}
                  onChange={() =>
                    onChangeView({
                      ...view,
                      hiddenPropertyIds: hidden
                        ? view.hiddenPropertyIds.filter((id) => id !== p.id)
                        : [...view.hiddenPropertyIds, p.id],
                    })
                  }
                />
              );
            })}
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}
