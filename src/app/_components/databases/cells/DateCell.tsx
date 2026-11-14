"use client";

import { UnstyledButton } from "@mantine/core";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import type { PropertyDef } from "~/lib/databases/schema";
import { displayDate } from "~/lib/databases/display";
import styles from "../DatabaseBlock.module.css";

interface DateCellProps {
  def: PropertyDef;
  /** The stored ISO string (`YYYY-MM-DD` or an instant). */
  value: string | null | undefined;
  editable: boolean;
  onCommit: (next: string | null) => void;
}

/** A date as the picker holds it: a bare day stays a local day, an instant stays an instant. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Store what was picked as a calendar day; a database date is a day unless it was written as an instant. */
function toStored(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A date cell: the shared calendar popover (`UnifiedDatePicker`) behind a
 * plain text trigger that reads like the other cells. Picks store as a
 * `YYYY-MM-DD` day; clearing empties the cell.
 */
export function DateCell({ def, value, editable, onCommit }: DateCellProps) {
  const text = value ? displayDate(value) : "";
  if (!editable) {
    return <span className={styles.cellText}>{text}</span>;
  }
  return (
    <UnifiedDatePicker
      value={toDate(value)}
      onChange={(date) => onCommit(toStored(date))}
      onClear={() => onCommit(null)}
      placeholder=""
      renderTrigger={({ toggle }) => (
        <UnstyledButton
          className={styles.pillButton}
          aria-label={def.name}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }
          }}
        >
          {text ? <span className={styles.cellText}>{text}</span> : <span className={styles.cellEmpty}>—</span>}
        </UnstyledButton>
      )}
    />
  );
}
