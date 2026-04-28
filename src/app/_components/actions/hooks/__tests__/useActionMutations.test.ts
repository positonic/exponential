import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Capture every config passed to api.action.update.useMutation so tests can
// invoke the lifecycle callbacks (onSettled) directly.
type UpdateMutationConfig = {
  onMutate?: (vars: unknown) => Promise<unknown> | unknown;
  onError?: (err: unknown, vars: unknown, ctx: unknown) => void;
  onSettled?: (data: unknown) => void;
};

const { invalidates, lastConfig, mockMutate } = vi.hoisted(() => {
  const invalidates = {
    getAll: vi.fn(),
    getToday: vi.fn(),
    getByTranscription: vi.fn(),
    getProjectActions: vi.fn(),
    getTodayScore: vi.fn(),
    getProductivityStats: vi.fn(),
  };
  const lastConfig = { current: undefined as UpdateMutationConfig | undefined };
  const mockMutate = vi.fn();
  return { invalidates, lastConfig, mockMutate };
});

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      action: {
        getAll: {
          cancel: vi.fn(async () => {}),
          getData: vi.fn(() => undefined),
          setData: vi.fn(),
          invalidate: invalidates.getAll,
        },
        getToday: {
          cancel: vi.fn(async () => {}),
          getData: vi.fn(() => undefined),
          setData: vi.fn(),
          invalidate: invalidates.getToday,
        },
        getByTranscription: {
          invalidate: invalidates.getByTranscription,
        },
        getProjectActions: {
          invalidate: invalidates.getProjectActions,
        },
      },
      scoring: {
        getTodayScore: { invalidate: invalidates.getTodayScore },
        getProductivityStats: { invalidate: invalidates.getProductivityStats },
      },
    }),
    action: {
      update: {
        useMutation: (config: UpdateMutationConfig) => {
          lastConfig.current = config;
          return { mutate: mockMutate, isPending: false };
        },
      },
    },
  },
}));

import { useActionMutations } from "../useActionMutations";

beforeEach(() => {
  Object.values(invalidates).forEach((m) => m.mockClear());
  mockMutate.mockClear();
  lastConfig.current = undefined;
});

describe("useActionMutations onSettled routing", () => {
  test("transcription-actions routes to getByTranscription", () => {
    renderHook(() =>
      useActionMutations({ viewName: "transcription-actions" }),
    );
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getByTranscription).toHaveBeenCalledTimes(1);
    expect(invalidates.getAll).not.toHaveBeenCalled();
    expect(invalidates.getToday).not.toHaveBeenCalled();
  });

  test("today (lowercase) invalidates both getAll and getToday", () => {
    renderHook(() => useActionMutations({ viewName: "today" }));
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
    expect(invalidates.getToday).toHaveBeenCalledTimes(1);
  });

  test("Today (mixed case) invalidates both via toLowerCase", () => {
    renderHook(() => useActionMutations({ viewName: "Today" }));
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
    expect(invalidates.getToday).toHaveBeenCalledTimes(1);
  });

  test("projectId in result routes to getProjectActions", () => {
    renderHook(() => useActionMutations({ viewName: "actions" }));
    lastConfig.current?.onSettled?.({ projectId: "proj-123" });
    expect(invalidates.getProjectActions).toHaveBeenCalledWith({
      projectId: "proj-123",
    });
    expect(invalidates.getAll).not.toHaveBeenCalled();
  });

  test("default viewName falls back to getAll", () => {
    renderHook(() => useActionMutations({ viewName: "actions" }));
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
  });

  test("scoring queries always invalidate on settled", () => {
    renderHook(() => useActionMutations({ viewName: "actions" }));
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getTodayScore).toHaveBeenCalledTimes(1);
    expect(invalidates.getProductivityStats).toHaveBeenCalledTimes(1);
  });
});
