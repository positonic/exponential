/**
 * useRefetchAfterMutations tests — a real QueryClient, fake timers. The badge
 * hooks mount in several places on every page, so the contract under test is
 * "one invalidation per key per burst of mutations", however many mounts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS,
  useRefetchAfterMutations,
} from "../useRefetchAfterMutations";

const COUNTS_KEY = [["inbox", "waitingOnMeCounts"]];
const UNREAD_KEY = [["notification", "unreadCount"]];

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function succeedMutation() {
  await act(async () => {
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.resolve("ok") })
      .execute(undefined);
  });
}

async function failMutation() {
  await act(async () => {
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(new Error("nope")), retry: false })
      .execute(undefined)
      .catch(() => undefined);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient();
  vi.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
});

describe("useRefetchAfterMutations", () => {
  it("collapses a burst of mutations into one invalidation per key", async () => {
    renderHook(() => useRefetchAfterMutations([COUNTS_KEY, UNREAD_KEY]), { wrapper });

    await succeedMutation();
    await succeedMutation();
    await succeedMutation();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS));

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: COUNTS_KEY },
      { cancelRefetch: false },
    );
  });

  it("shares one subscription across mounts of the same key", async () => {
    renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });
    renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });
    renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });

    await succeedMutation();
    act(() => void vi.advanceTimersByTime(REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS));

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("ignores failed mutations", async () => {
    renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });

    await failMutation();
    act(() => void vi.advanceTimersByTime(REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS));

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("keeps a key while any mount remains, and stops once the last unmounts", async () => {
    const first = renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });
    const second = renderHook(() => useRefetchAfterMutations([COUNTS_KEY]), { wrapper });

    first.unmount();
    await succeedMutation();
    act(() => void vi.advanceTimersByTime(REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS));
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);

    second.unmount();
    await succeedMutation();
    act(() => void vi.advanceTimersByTime(REFETCH_AFTER_MUTATIONS_DEBOUNCE_MS));
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
