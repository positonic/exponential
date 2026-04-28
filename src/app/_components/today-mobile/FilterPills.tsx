"use client";

import { useEffect, useRef, useState } from "react";
import { MultiSelect } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconHash } from "@tabler/icons-react";
import styles from "./MobileToday.module.css";

interface FilterPillsProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

const VISIBLE_PILLS = 4;

export function FilterPills({ options, selected, onChange }: FilterPillsProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [popoverOpen]);

  const visible = options.slice(0, VISIBLE_PILLS);
  const allActive = selected.length === 0;

  return (
    <div className={styles.pills}>
      <button
        type="button"
        className={`${styles.pill} ${allActive ? styles.pillActive : ""}`}
        onClick={() => onChange([])}
        aria-pressed={allActive}
      >
        All
      </button>
      {visible.map((opt) => {
        const active = selected.length === 1 && selected[0] === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`${styles.pill} ${active ? styles.pillActive : ""}`}
            onClick={() => onChange(active ? [] : [opt.value])}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
      <div className={styles.filterWrap} ref={wrapRef}>
        <button
          type="button"
          className={styles.pill}
          onClick={() => setPopoverOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
        >
          <IconAdjustmentsHorizontal size={14} />
          Filter
        </button>
        {popoverOpen && (
          <div className={styles.popover} role="dialog">
            <MultiSelect
              data={options}
              value={selected}
              onChange={onChange}
              placeholder="Filter by tags..."
              leftSection={<IconHash size={14} />}
              clearable
              searchable
              size="sm"
              maxDropdownHeight={240}
              styles={{
                input: {
                  backgroundColor: "var(--color-surface-secondary)",
                  borderColor: "var(--color-border-primary)",
                },
                dropdown: {
                  backgroundColor: "var(--color-surface-secondary)",
                  borderColor: "var(--color-border-primary)",
                },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
