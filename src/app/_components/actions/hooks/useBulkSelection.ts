import { useCallback, useMemo, useState } from "react";

interface UseBulkSelectionResult<T> {
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  clear: () => void;
  count: number;
  selectedItems: T[];
}

export function useBulkSelection<T extends { id: string }>(
  items: T[],
): UseBulkSelectionResult<T> {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((it) => it.id)));
  }, [items]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const clear = selectNone;

  const selectedItems = useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected],
  );

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    selectNone,
    clear,
    count: selected.size,
    selectedItems,
  };
}
