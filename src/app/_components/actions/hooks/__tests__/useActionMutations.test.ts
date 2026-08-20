import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Capture every config passed to api.action.update.useMutation so tests can
// invoke the lifecycle callbacks (onSettled) directly.
type UpdateMutationConfig = {
  onMutate?: (vars: unknown) => Promise<unknown> | unknown;
  onError?: (err: unknown, vars: unknown, ctx: unknown) => void;
  onSettled?: (data: unknown) => void;
};

const { invalidates, projectActionsCache, lastConfig, mockMutate } = vi.hoisted(() => {
  const invalidates = {
    getAll: vi.fn(),
    getToday: vi.fn(),
    getByTranscription: vi.fn(),
    getProjectActions: vi.fn(),
    getTodayScore: vi.fn(),
    getProductivityStats: vi.fn(),
  };
  const projectActionsCache = {
    cancel: vi.fn(async () => {}),
    getData: vi.fn(() => undefined as unknown),
    setData: vi.fn(),
  };
  const lastConfig = { current: undefined as UpdateMutationConfig | undefined };
  const mockMutate = vi.fn();
  return { invalidates, projectActionsCache, lastConfig, mockMutate };
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
          cancel: projectActionsCache.cancel,
          getData: projectActionsCache.getData,
          setData: projectActionsCache.setData,
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
  projectActionsCache.cancel.mockClear();
  projectActionsCache.getData.mockClear();
  projectActionsCache.setData.mockClear();
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

describe("useActionMutations optimistic project cache", () => {
  test("with projectId in context, onMutate patches getProjectActions", async () => {
    projectActionsCache.getData.mockReturnValueOnce([
      { id: "a1", status: "ACTIVE" },
    ]);
    renderHook(() =>
      useActionMutations({ viewName: "project-x", projectId: "proj-123" }),
    );
    await lastConfig.current?.onMutate?.({ id: "a1", status: "COMPLETED" });
    expect(projectActionsCache.cancel).toHaveBeenCalledWith({
      projectId: "proj-123",
    });
    expect(projectActionsCache.setData).toHaveBeenCalledTimes(1);
    expect(projectActionsCache.setData.mock.calls[0]?.[0]).toEqual({
      projectId: "proj-123",
    });
    // The updater marks the matching row COMPLETED and leaves others alone.
    const apply = projectActionsCache.setData.mock.calls[0]?.[1] as (
      list: Array<{ id: string; status: string }> | undefined,
    ) => Array<{ id: string; status: string }>;
    expect(
      apply([
        { id: "a1", status: "ACTIVE" },
        { id: "a2", status: "ACTIVE" },
      ]),
    ).toEqual([
      { id: "a1", status: "COMPLETED" },
      { id: "a2", status: "ACTIVE" },
    ]);
  });

  test("onError restores the getProjectActions snapshot", async () => {
    const previous = [{ id: "a1", status: "ACTIVE" }];
    projectActionsCache.getData.mockReturnValueOnce(previous);
    renderHook(() =>
      useActionMutations({ viewName: "project-x", projectId: "proj-123" }),
    );
    const ctx = await lastConfig.current?.onMutate?.({
      id: "a1",
      status: "COMPLETED",
    });
    projectActionsCache.setData.mockClear();
    lastConfig.current?.onError?.(new Error("boom"), { id: "a1" }, ctx);
    expect(projectActionsCache.setData).toHaveBeenCalledWith(
      { projectId: "proj-123" },
      previous,
    );
  });

  test("without projectId, getProjectActions cache is untouched", async () => {
    renderHook(() => useActionMutations({ viewName: "today" }));
    await lastConfig.current?.onMutate?.({ id: "a1", status: "COMPLETED" });
    expect(projectActionsCache.cancel).not.toHaveBeenCalled();
    expect(projectActionsCache.setData).not.toHaveBeenCalled();
  });

  test("with an unfetched getProjectActions cache, no empty list is seeded", async () => {
    projectActionsCache.getData.mockReturnValueOnce(undefined);
    renderHook(() =>
      useActionMutations({ viewName: "project-x", projectId: "proj-123" }),
    );
    await lastConfig.current?.onMutate?.({ id: "a1", status: "COMPLETED" });
    expect(projectActionsCache.setData).not.toHaveBeenCalled();
  });
});
