/**
 * Unit tests for the shared `useFavorite` hook.
 *
 * Mocks `~/trpc/react` so we can drive the toggle mutation's lifecycle
 * callbacks directly (mirrors useActionMutations.test.ts) and assert the
 * optimistic flip, rollback on error, and dual invalidation (item state +
 * sidebar list) without a real network or QueryClient.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";

type ToggleConfig = {
  onMutate?: () => Promise<{ prev: unknown } | undefined> | { prev: unknown } | undefined;
  onError?: (err: unknown, vars: unknown, ctx: { prev?: unknown } | undefined) => void;
  onSettled?: () => void;
};

const { utils, lastConfig, mockMutate } = vi.hoisted(() => {
  const utils = {
    isFavorite: {
      cancel: vi.fn(async () => {}),
      getData: vi.fn(() => ({ favorited: false }) as { favorited: boolean } | undefined),
      setData: vi.fn(),
      invalidate: vi.fn(),
    },
    list: { invalidate: vi.fn() },
  };
  const lastConfig = { current: undefined as ToggleConfig | undefined };
  const mockMutate = vi.fn();
  return { utils, lastConfig, mockMutate };
});

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ favorite: utils }),
    favorite: {
      isFavorite: {
        useQuery: () => ({ data: { favorited: false }, isLoading: false }),
      },
      toggle: {
        useMutation: (config: ToggleConfig) => {
          lastConfig.current = config;
          return { mutate: mockMutate, isPending: false };
        },
      },
    },
  },
}));

import { useFavorite } from "../useFavorite";

beforeEach(() => {
  utils.isFavorite.cancel.mockClear();
  utils.isFavorite.getData.mockClear();
  utils.isFavorite.setData.mockClear();
  utils.isFavorite.invalidate.mockClear();
  utils.list.invalidate.mockClear();
  mockMutate.mockClear();
  lastConfig.current = undefined;
});

describe("useFavorite", () => {
  test("toggle() passes page label/icon/workspaceId through to the mutation", () => {
    const { result } = renderHook(() =>
      useFavorite({
        entityType: "page",
        entityId: "products/acme/features",
        label: "Acme · Features",
        icon: "features",
        workspaceId: "ws-1",
      }),
    );

    result.current.toggle();

    expect(mockMutate).toHaveBeenCalledWith({
      entityType: "page",
      entityId: "products/acme/features",
      label: "Acme · Features",
      icon: "features",
      workspaceId: "ws-1",
    });
  });

  test("toggle() is a no-op when entityId is empty", () => {
    const { result } = renderHook(() =>
      useFavorite({ entityType: "page", entityId: "" }),
    );
    result.current.toggle();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  test("onMutate optimistically flips the cached favourited state", async () => {
    renderHook(() => useFavorite({ entityType: "objective", entityId: "42" }));

    await lastConfig.current?.onMutate?.();

    expect(utils.isFavorite.cancel).toHaveBeenCalledTimes(1);
    // setData called with the key + an updater that flips favorited.
    const updater = utils.isFavorite.setData.mock.calls[0]?.[1] as (
      old: { favorited: boolean } | undefined,
    ) => { favorited: boolean };
    expect(updater({ favorited: false })).toEqual({ favorited: true });
    expect(updater({ favorited: true })).toEqual({ favorited: false });
  });

  test("onError restores the previous cached state", () => {
    renderHook(() => useFavorite({ entityType: "objective", entityId: "42" }));

    const prev = { favorited: true };
    lastConfig.current?.onError?.(new Error("boom"), undefined, { prev });

    const restoreCall = utils.isFavorite.setData.mock.calls.at(-1);
    expect(restoreCall?.[1]).toBe(prev);
  });

  test("onSettled invalidates both the item state and the sidebar list", () => {
    renderHook(() => useFavorite({ entityType: "objective", entityId: "42" }));

    lastConfig.current?.onSettled?.();

    expect(utils.isFavorite.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.list.invalidate).toHaveBeenCalledTimes(1);
  });
});
