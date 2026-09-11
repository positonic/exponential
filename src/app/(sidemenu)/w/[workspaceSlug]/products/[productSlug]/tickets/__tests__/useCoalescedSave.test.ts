import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCoalescedSave } from "../useCoalescedSave";

interface Prefs {
  view?: string;
  filters?: { status: string[] };
  sortField?: string;
}

describe("useCoalescedSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("merges pushes inside the window into one save", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useCoalescedSave<Prefs>(save, 500));

    // Toggle a filter, then switch view on the click that closes the popover.
    act(() => result.current.push({ filters: { status: ["BACKLOG"] } }));
    act(() => result.current.push({ view: "board" }));
    expect(save).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ filters: { status: ["BACKLOG"] }, view: "board" });
  });

  test("a later value for the same key wins", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useCoalescedSave<Prefs>(save, 500));

    act(() => result.current.push({ view: "board" }));
    act(() => result.current.push({ view: "list" }));
    act(() => vi.advanceTimersByTime(500));

    expect(save).toHaveBeenCalledWith({ view: "list" });
  });

  test("each push restarts the window", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useCoalescedSave<Prefs>(save, 500));

    act(() => result.current.push({ view: "board" }));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.push({ sortField: "title" }));
    act(() => vi.advanceTimersByTime(400));
    expect(save).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(100));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ view: "board", sortField: "title" });
  });

  test("windows that have flushed don't leak into the next one", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useCoalescedSave<Prefs>(save, 500));

    act(() => result.current.push({ view: "board" }));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.push({ sortField: "title" }));
    act(() => vi.advanceTimersByTime(500));

    expect(save).toHaveBeenNthCalledWith(1, { view: "board" });
    expect(save).toHaveBeenNthCalledWith(2, { sortField: "title" });
  });

  test("unmount flushes what is pending, and nothing when nothing is", () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() => useCoalescedSave<Prefs>(save, 500));

    act(() => result.current.push({ filters: { status: ["QA"] } }));
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ filters: { status: ["QA"] } });

    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("uses the latest save callback, not the one from first render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ save }: { save: (p: Partial<Prefs>) => void }) => useCoalescedSave<Prefs>(save, 500),
      { initialProps: { save: first } },
    );

    act(() => result.current.push({ view: "board" }));
    rerender({ save: second });
    act(() => vi.advanceTimersByTime(500));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ view: "board" });
  });
});
