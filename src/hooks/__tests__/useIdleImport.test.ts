/**
 * useIdleImport tests — when the import starts (idle, or on demand), that a
 * loaded value is returned as-is (functions included), and that a failed
 * import is retried only when the caller next needs it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const { reportHandledError } = vi.hoisted(() => ({ reportHandledError: vi.fn() }));
vi.mock("~/lib/reportHandledError", () => ({ reportHandledError }));

import { useIdleImport } from "../useIdleImport";

let idleCallbacks: IdleRequestCallback[] = [];

beforeEach(() => {
  idleCallbacks = [];
  vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
    idleCallbacks.push(cb);
    return idleCallbacks.length;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  reportHandledError.mockReset();
});

afterEach(() => {
  // Unmount before removing the stubs: the hook cancels its idle callback on unmount.
  cleanup();
  vi.unstubAllGlobals();
});

function runIdle() {
  act(() => {
    for (const cb of idleCallbacks.splice(0)) cb({ didTimeout: false, timeRemaining: () => 50 });
  });
}

function Component() {
  return null;
}

describe("useIdleImport", () => {
  it("does not load before idle, then loads once the page is idle", async () => {
    const load = vi.fn().mockResolvedValue(Component);
    const { result } = renderHook(() => useIdleImport(load, false, "test"));

    expect(load).not.toHaveBeenCalled();
    expect(result.current.value).toBeNull();

    runIdle();
    await waitFor(() => expect(result.current.value).toBe(Component));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads immediately when needed before idle", async () => {
    const load = vi.fn().mockResolvedValue(Component);
    const { result, rerender } = renderHook(({ needed }) => useIdleImport(load, needed, "test"), {
      initialProps: { needed: false },
    });

    rerender({ needed: true });
    await waitFor(() => expect(result.current.value).toBe(Component));

    // The idle callback firing afterwards doesn't import again.
    runIdle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a failed import and retries only when next needed", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("chunk failed")).mockResolvedValue(Component);
    const { result, rerender } = renderHook(({ needed }) => useIdleImport(load, needed, "test-area"), {
      initialProps: { needed: false },
    });

    runIdle();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(reportHandledError).toHaveBeenCalledWith(expect.any(Error), { area: "test-area" });
    expect(load).toHaveBeenCalledTimes(1);

    rerender({ needed: true });
    await waitFor(() => expect(result.current.value).toBe(Component));
    expect(result.current.failed).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
