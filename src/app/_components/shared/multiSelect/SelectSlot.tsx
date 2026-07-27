"use client";

import { Checkbox } from "@mantine/core";

function slotClickHandlers(onToggle: () => void, onRangeToggle?: () => void) {
  return {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey && onRangeToggle) onRangeToggle();
      else onToggle();
    },
    // Keep shift-click from starting a text selection and keep the row's own
    // mousedown handlers (drag, collapse) out of checkbox clicks.
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

/**
 * Swap-in-place selection checkbox (Gmail-style): renders `children` (the
 * row's existing leading element - ID, status badge, group chevron) and swaps
 * it for a checkbox on row hover or while selected. The checkbox is
 * absolutely positioned inside the slot, so it never changes the row's
 * geometry - zero layout shift, per-row and globally.
 *
 * The host row must carry the `group/row` class for the hover swap to work.
 */
export function SelectSlot({
  selected,
  indeterminate,
  onToggle,
  onRangeToggle,
  className,
  children,
}: {
  selected: boolean;
  /** For group/select-all slots: some but not all members selected. */
  indeterminate?: boolean;
  onToggle: () => void;
  /** Shift-click handler (range selection). Falls back to onToggle. */
  onRangeToggle?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = selected || (indeterminate ?? false);
  return (
    <span className={`relative flex min-w-0 items-center ${className ?? ""}`}>
      <span
        className={`flex min-w-0 items-center ${active ? "invisible" : "group-hover/row:invisible"}`}
      >
        {children}
      </span>
      <span
        className={`absolute inset-y-0 left-0 flex cursor-pointer items-center ${active ? "" : "invisible group-hover/row:visible"}`}
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : selected}
        {...slotClickHandlers(onToggle, onRangeToggle)}
      >
        <Checkbox
          size="xs"
          checked={selected}
          indeterminate={indeterminate}
          readOnly
          tabIndex={-1}
          styles={{
            input: { pointerEvents: "none", cursor: "pointer" },
            body: { pointerEvents: "none" },
          }}
        />
      </span>
    </span>
  );
}

/**
 * Floating selection checkbox for cards (kanban / card grids): absolutely
 * positioned in the card's top-right corner, shown on hover or while
 * selected. Never affects card layout. The host card must be `relative` and
 * carry the `group/card` class.
 */
export function CardSelectCheckbox({
  selected,
  onToggle,
  onRangeToggle,
}: {
  selected: boolean;
  onToggle: () => void;
  onRangeToggle?: () => void;
}) {
  return (
    <span
      className={`absolute right-1.5 top-1.5 z-10 flex cursor-pointer items-center ${selected ? "" : "opacity-0 group-hover/card:opacity-100"}`}
      role="checkbox"
      aria-checked={selected}
      {...slotClickHandlers(onToggle, onRangeToggle)}
    >
      <Checkbox
        size="xs"
        checked={selected}
        readOnly
        tabIndex={-1}
        styles={{
          input: { pointerEvents: "none", cursor: "pointer" },
          body: { pointerEvents: "none" },
        }}
      />
    </span>
  );
}

/**
 * Right-aligned group-header checkbox for headers that have no chevron to
 * swap (e.g. the features list's Area headers): absolutely positioned at the
 * header's right edge, shown on header hover or while any member is
 * selected. The host header must be `relative` and carry the `group/row`
 * class.
 */
export function HeaderSelectCheckbox({
  selected,
  indeterminate,
  onToggle,
}: {
  selected: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
}) {
  const active = selected || (indeterminate ?? false);
  return (
    <span
      className={`absolute inset-y-0 right-3 z-10 flex cursor-pointer items-center ${active ? "" : "opacity-0 group-hover/row:opacity-100"}`}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : selected}
      {...slotClickHandlers(onToggle)}
    >
      <Checkbox
        size="xs"
        checked={selected}
        indeterminate={indeterminate}
        readOnly
        tabIndex={-1}
        styles={{
          input: { pointerEvents: "none", cursor: "pointer" },
          body: { pointerEvents: "none" },
        }}
      />
    </span>
  );
}
