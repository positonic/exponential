import { describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBulkSelection } from "../useBulkSelection";

interface Item {
  id: string;
}

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

describe("useBulkSelection", () => {
  test("initial state is empty", () => {
    const { result } = renderHook(() => useBulkSelection<Item>(items("a", "b")));
    expect(result.current.selected.size).toBe(0);
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.selectedItems).toEqual([]);
  });

  test("toggle adds then removes", () => {
    const { result } = renderHook(() =>
      useBulkSelection<Item>(items("a", "b", "c")),
    );

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  test("selectAll selects every input item", () => {
    const list = items("a", "b", "c");
    const { result } = renderHook(() => useBulkSelection<Item>(list));

    act(() => result.current.selectAll());
    expect(result.current.count).toBe(3);
    expect(result.current.selectedItems).toEqual(list);
  });

  test("selectNone clears the selection", () => {
    const { result } = renderHook(() =>
      useBulkSelection<Item>(items("a", "b")),
    );
    act(() => result.current.selectAll());
    act(() => result.current.selectNone());
    expect(result.current.count).toBe(0);
    expect(result.current.selectedItems).toEqual([]);
  });

  test("clear is identical to selectNone", () => {
    const { result } = renderHook(() =>
      useBulkSelection<Item>(items("a", "b")),
    );
    act(() => result.current.selectAll());
    expect(result.current.count).toBe(2);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  test("selectedItems excludes ids no longer in input", () => {
    const initial = items("a", "b", "c");
    const { result, rerender } = renderHook(
      ({ list }) => useBulkSelection<Item>(list),
      { initialProps: { list: initial } },
    );

    act(() => result.current.selectAll());
    expect(result.current.selectedItems).toHaveLength(3);

    rerender({ list: items("a") });
    expect(result.current.selectedItems).toEqual([{ id: "a" }]);
    // Internal Set may still hold 'b' and 'c' until cleared — that's the
    // documented behavior.
    expect(result.current.selected.size).toBe(3);
  });
});
