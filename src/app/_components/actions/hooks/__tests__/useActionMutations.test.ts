import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

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
      // getQueryKey() only reads `_def().path`, so these stubs are enough to
      // let the hook build real query keys against the mocked client.
      getAll: { _def: () => ({ path: ["action", "getAll"] }) },
      getToday: { _def: () => ({ path: ["action", "getToday"] }) },
      getProjectActions: { _def: () => ({ path: ["action", "getProjectActions"] }) },
    },
  },
}));

import { api } from "~/trpc/react";
import { useActionMutations } from "../useActionMutations";

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

const renderUseActionMutations = (viewName: string) =>
  renderHook(() => useActionMutations({ viewName }), { wrapper });

beforeEach(() => {
  Object.values(invalidates).forEach((m) => m.mockClear());
  mockMutate.mockClear();
  lastConfig.current = undefined;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe("useActionMutations onSettled routing", () => {
  test("transcription-actions routes to getByTranscription", () => {
    renderUseActionMutations("transcription-actions");
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getByTranscription).toHaveBeenCalledTimes(1);
    expect(invalidates.getAll).not.toHaveBeenCalled();
    expect(invalidates.getToday).not.toHaveBeenCalled();
  });

  test("today (lowercase) invalidates both getAll and getToday", () => {
    renderUseActionMutations("today");
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
    expect(invalidates.getToday).toHaveBeenCalledTimes(1);
  });

  test("Today (mixed case) invalidates both via toLowerCase", () => {
    renderUseActionMutations("Today");
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
    expect(invalidates.getToday).toHaveBeenCalledTimes(1);
  });

  test("projectId in result routes to getProjectActions", () => {
    renderUseActionMutations("actions");
    lastConfig.current?.onSettled?.({ projectId: "proj-123" });
    expect(invalidates.getProjectActions).toHaveBeenCalledWith({
      projectId: "proj-123",
    });
    expect(invalidates.getAll).not.toHaveBeenCalled();
  });

  test("default viewName falls back to getAll", () => {
    renderUseActionMutations("actions");
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getAll).toHaveBeenCalledTimes(1);
  });

  test("scoring queries always invalidate on settled", () => {
    renderUseActionMutations("actions");
    lastConfig.current?.onSettled?.({ projectId: null });
    expect(invalidates.getTodayScore).toHaveBeenCalledTimes(1);
    expect(invalidates.getProductivityStats).toHaveBeenCalledTimes(1);
  });
});

// The project page's Tasks tab reads action.getProjectActions, not getAll.
// While onMutate patched getAll only, a reschedule there showed nothing until
// the mutation *and* the follow-up refetch had both landed — a ~3s stall.
describe("useActionMutations optimistic patching", () => {
  const projectActionsKey = (projectId: string) =>
    getQueryKey(api.action.getProjectActions, { projectId }, "query");

  const seedProject = (projectId: string) =>
    queryClient.setQueryData(projectActionsKey(projectId), [
      { id: "a1", name: "Overdue task", scheduledStart: new Date("2020-01-01"), dueDate: new Date("2020-01-01") },
      { id: "a2", name: "Untouched", scheduledStart: null, dueDate: null },
    ]);

  test("patches the cached getProjectActions list for the targeted action", async () => {
    seedProject("proj-1");
    renderUseActionMutations("project-grow-socials");

    const nextDate = new Date("2026-08-09T00:00:00");
    await lastConfig.current?.onMutate?.({
      id: "a1",
      scheduledStart: nextDate,
      dueDate: nextDate,
    });

    const patched = queryClient.getQueryData(projectActionsKey("proj-1"));
    expect(patched).toEqual([
      expect.objectContaining({ id: "a1", scheduledStart: nextDate, dueDate: nextDate }),
      expect.objectContaining({ id: "a2", scheduledStart: null, dueDate: null }),
    ]);
  });

  test("patches every cached project variant, not just one", async () => {
    seedProject("proj-1");
    seedProject("proj-2");
    renderUseActionMutations("project-grow-socials");

    await lastConfig.current?.onMutate?.({ id: "a1", status: "COMPLETED" });

    for (const projectId of ["proj-1", "proj-2"]) {
      const rows = queryClient.getQueryData<Array<{ id: string; status?: string }>>(
        projectActionsKey(projectId),
      );
      expect(rows?.[0]).toMatchObject({ id: "a1", status: "COMPLETED" });
    }
  });

  test("onError rolls the cached list back", async () => {
    seedProject("proj-1");
    renderUseActionMutations("project-grow-socials");

    const before = queryClient.getQueryData(projectActionsKey("proj-1"));
    const snapshot = await lastConfig.current?.onMutate?.({
      id: "a1",
      status: "COMPLETED",
    });
    lastConfig.current?.onError?.(new Error("boom"), { id: "a1" }, snapshot);

    expect(queryClient.getQueryData(projectActionsKey("proj-1"))).toEqual(before);
  });

  test("does not fabricate cache entries for lists the user never opened", async () => {
    renderUseActionMutations("project-grow-socials");

    await lastConfig.current?.onMutate?.({ id: "a1", status: "COMPLETED" });

    expect(queryClient.getQueryData(getQueryKey(api.action.getAll, undefined, "query")))
      .toBeUndefined();
  });
});
