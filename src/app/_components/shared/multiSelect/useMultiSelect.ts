"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Selection state for multi-select list/board surfaces. Selection is keyed by
 * item id and lives at the page level so it survives view switches (table ↔
 * board ↔ list); pages clear it explicitly when the underlying item set
 * changes meaning (filters, search, entity switch).
 */
export function useMultiSelect() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Anchor for shift-click range selection: the last individually toggled id.
  const anchorRef = useRef<string | null>(null);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    anchorRef.current = id;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Shift-click: select the contiguous range between the anchor and `id`
   * within `orderedIds` (the currently visible row order). Falls back to a
   * plain toggle when there is no usable anchor.
   */
  const selectRange = useCallback(
    (id: string, orderedIds: string[]) => {
      const anchor = anchorRef.current;
      const from = anchor ? orderedIds.indexOf(anchor) : -1;
      const to = orderedIds.indexOf(id);
      if (from === -1 || to === -1) {
        toggle(id);
        return;
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(orderedIds[i]!);
        return next;
      });
    },
    [toggle],
  );

  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelected(new Set());
  }, []);

  // Esc clears the selection - but never while a Mantine overlay (modal,
  // menu, popover) is open, since Esc is that overlay's close key, and never
  // while typing in an input.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      // Closed Mantine modals stay mounted as zero-height roots; an OPEN one
      // has real height. Menu/Popover dropdowns unmount when closed, so mere
      // presence means open.
      const modalOpen = Array.from(
        document.querySelectorAll(".mantine-Modal-root"),
      ).some((el) => el.clientHeight > 0);
      const dropdownOpen = !!document.querySelector(
        ".mantine-Menu-dropdown, .mantine-Popover-dropdown",
      );
      if (modalOpen || dropdownOpen) return;
      clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size, clear]);

  return {
    selected,
    count: selected.size,
    anySelected: selected.size > 0,
    isSelected,
    toggle,
    selectRange,
    setMany,
    clear,
  };
}

export type MultiSelect = ReturnType<typeof useMultiSelect>;
