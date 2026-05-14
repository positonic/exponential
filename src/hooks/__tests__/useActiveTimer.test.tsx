/**
 * useActiveTimer hook tests — mocks `~/trpc/react` so the test exercises only
 * the hook's elapsed-tick logic and its delegation to the mutation, not the
 * tRPC plumbing itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
});

const { mockGetActive, mockStopMutate, mockInvalidate, useStopMock } =
  vi.hoisted(() => ({
    mockGetActive: vi.fn(),
    mockStopMutate: vi.fn(),
    mockInvalidate: vi.fn(() => Promise.resolve()),
    useStopMock: vi.fn(),
  }));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      timeEntry: {
        getActive: { invalidate: mockInvalidate },
        listRecent: { invalidate: mockInvalidate },
      },
    }),
    timeEntry: {
      getActive: {
        useQuery: (...args: unknown[]) => mockGetActive(...args),
      },
      stop: {
        useMutation: (opts: { onSuccess?: () => Promise<void> | void }) =>
          useStopMock(opts),
      },
    },
  },
}));

import {
  useActiveTimer,
  formatElapsedClock,
} from "../useActiveTimer";

beforeEach(() => {
  vi.useRealTimers();
  mockGetActive.mockReset();
  mockStopMutate.mockReset();
  mockInvalidate.mockReset();
  useStopMock.mockReset();
  // Default stop mutation shape
  useStopMock.mockImplementation(() => ({
    mutate: mockStopMutate,
    isPending: false,
  }));
});

describe("useActiveTimer", () => {
  it("returns null state when no timer is running", () => {
    mockGetActive.mockReturnValue({ data: null, isLoading: false });
    const { result } = renderHook(() => useActiveTimer());
    expect(result.current.entry).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedMs).toBe(0);
  });

  it("returns active entry and ticks elapsedMs forward", () => {
    vi.useFakeTimers();
    const startedAt = new Date(Date.now() - 5_000); // 5s ago
    mockGetActive.mockReturnValue({
      data: { id: "entry-1", startedAt, action: { id: "a", name: "x" } },
      isLoading: false,
    });

    const { result } = renderHook(() => useActiveTimer());
    expect(result.current.isRunning).toBe(true);
    const initial = result.current.elapsedMs;
    expect(initial).toBeGreaterThanOrEqual(5_000);

    // Advance 3s → elapsedMs should grow by ~3000ms
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(initial + 2_900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(initial + 3_100);
  });

  it("stop() invokes the stop mutation with the running entry's id", () => {
    mockGetActive.mockReturnValue({
      data: { id: "entry-99", startedAt: new Date(), action: null },
      isLoading: false,
    });

    const { result } = renderHook(() => useActiveTimer());
    act(() => {
      result.current.stop();
    });
    expect(mockStopMutate).toHaveBeenCalledWith({ entryId: "entry-99" });
  });

  it("stop() is a no-op when nothing is running", () => {
    mockGetActive.mockReturnValue({ data: null, isLoading: false });
    const { result } = renderHook(() => useActiveTimer());
    act(() => {
      result.current.stop();
    });
    expect(mockStopMutate).not.toHaveBeenCalled();
  });

  it("invalidates getActive + listRecent on successful stop", async () => {
    // Capture the onSuccess callback
    let capturedOnSuccess: (() => Promise<void> | void) | undefined;
    useStopMock.mockImplementation(
      (opts: { onSuccess?: () => Promise<void> | void }) => {
        capturedOnSuccess = opts.onSuccess;
        return { mutate: mockStopMutate, isPending: false };
      },
    );
    mockGetActive.mockReturnValue({
      data: { id: "entry-x", startedAt: new Date(), action: null },
      isLoading: false,
    });

    renderHook(() => useActiveTimer());
    expect(capturedOnSuccess).toBeDefined();
    await capturedOnSuccess!();
    expect(mockInvalidate).toHaveBeenCalledTimes(2);
  });
});

describe("formatElapsedClock", () => {
  it("formats short durations as mm:ss", () => {
    expect(formatElapsedClock(0)).toBe("00:00");
    expect(formatElapsedClock(45_000)).toBe("00:45");
    expect(formatElapsedClock(125_000)).toBe("02:05");
  });

  it("switches to hh:mm:ss past 1 hour", () => {
    expect(formatElapsedClock(3_600_000)).toBe("01:00:00");
    expect(formatElapsedClock(3_661_000)).toBe("01:01:01");
  });

  it("clamps negative input to 00:00", () => {
    expect(formatElapsedClock(-1)).toBe("00:00");
  });
});
