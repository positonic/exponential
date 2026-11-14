"use client";

import { Checkbox } from "@mantine/core";
import type { PropertyDef } from "~/lib/databases/schema";

interface CheckboxCellProps {
  def: PropertyDef;
  value: boolean | null | undefined;
  editable: boolean;
  onCommit: (next: boolean) => void;
}

/** A checkbox cell: one click (or Space on the focused cell) flips it; no edit mode. */
export function CheckboxCell({ def, value, editable, onCommit }: CheckboxCellProps) {
  return (
    <Checkbox
      size="xs"
      checked={value === true}
      aria-label={def.name}
      disabled={!editable}
      onChange={(e) => onCommit(e.currentTarget.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
