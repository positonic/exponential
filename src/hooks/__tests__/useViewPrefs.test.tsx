/**
 * useViewPrefs tests - a real QueryClient, with `~/trpc/react` mocked onto
 * plain React Query hooks so each test decides when the prefs read and each
 * save resolve. The contract under test: whichever order the read and the
 * saves land in, the cached prefs end up holding the saved values, and
 * `prefs` never shows a pre-save value for a key the page has changed. Saves
 * run one at a time, so a second save's request goes out only once the first
 * has landed.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Prefs = Record<string, unknown>;

// Everything the mock factories touch must be hoisted with them.
const h = vi.hoisted(() => {
  const KEY = { productSlug: "fixture", workspaceId: "ws-1" };
  const prefsKey = (input: unknown) => [["product", "product", "getViewPrefs"], { input, type: "query" }];
  const SAVE_KEY = [["product", "product", "saveViewPrefs"]];
  return {
    KEY,
    prefsKey,
    SAVE_KEY,
    read: vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(),
    save: vi.fn<(vars: unknown) => Promise<unknown>>(),
    client: { current: null as unknown },
  };
});

function client(): QueryClient {
  if (!(h.client.current instanceof QueryClient)) throw new Error("no QueryClient for this test");
  return h.client.current;
}

vi.mock("~/trpc/react", async () => {
  const rq = await import("@tanstack/react-query");
  return {
    api: {
      useUtils: () => ({
        product: {
          product: {
            getViewPrefs: {
              setData: (input: unknown, updater: (prev: Prefs | undefined) => Prefs | undefined) =>
                client().setQueryData<Prefs>(h.prefsKey(input), updater),
              reset: (input: unknown) => client().resetQueries({ queryKey: h.prefsKey(input) }),
            },
          },
        },
      }),
      product: {
        product: {
          getViewPrefs: {
            useQuery: (input: unknown, opts?: { enabled?: boolean }) =>
              rq.useQuery({ queryKey: h.prefsKey(input), queryFn: () => h.read(input), enabled: opts?.enabled }),
          },
          saveViewPrefs: {
            useMutation: (opts: object) =>
              rq.useMutation({ mutationKey: h.SAVE_KEY, mutationFn: (vars: unknown) => h.save(vars), ...opts }),
          },
        },
      },
    },
  };
});

vi.mock("@trpc/react-query", async () => {
  const { api } = await import("~/trpc/react");
  return {
    getQueryKey: (procedure: unknown, input: unknown) => {
      if (procedure !== api.product.product.getViewPrefs) throw new Error("getQueryKey: not getViewPrefs");
      return h.prefsKey(input);
    },
    getMutationKey: (procedure: unknown) => {
      if (procedure !== api.product.product.saveViewPrefs) throw new Error("getMutationKey: not saveViewPrefs");
      return h.SAVE_KEY;
    },
  };
});

import { useViewPrefs } from "../useViewPrefs";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const cached = () => queryClient.getQueryData<Prefs>(h.prefsKey(h.KEY));

const render = (debounceMs = 0) =>
  renderHook(() => useViewPrefs<{ view?: string; groupBy?: string }>(h.KEY, { debounceMs }), { wrapper });

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  h.client.current = queryClient;
  h.read.mockReset();
  h.save.mockReset();
});

afterEach(() => queryClient.clear());

describe("useViewPrefs", () => {
  test("a change made while the first read is in flight outlives the read landing", async () => {
    const firstRead = deferred<Prefs>();
    h.read.mockReturnValueOnce(firstRead.promise);
    h.save.mockResolvedValue({});
    const { result } = render();
    expect(result.current.prefs).toBeUndefined();

    act(() => result.current.save({ view: "board" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    // Nothing is cached yet, so there is nothing to patch - and nothing a
    // page could mistake for the whole saved view.
    expect(cached()).toBeUndefined();
    expect(result.current.prefs).toBeUndefined();

    // The response was built before the save committed and lands after it.
    await act(async () => firstRead.resolve({ view: "table", groupBy: "status" }));

    await waitFor(() => expect(cached()).toEqual({ view: "board", groupBy: "status" }));
    expect(result.current.prefs).toEqual({ view: "board", groupBy: "status" });
    // Reconciled from what landed, not by reading again.
    expect(h.read).toHaveBeenCalledTimes(1);
  });

  test("prefs lays an unsaved change over the loaded prefs until it is saved", async () => {
    h.read.mockResolvedValue({ view: "table" });
    const firstSave = deferred<unknown>();
    h.save.mockReturnValueOnce(firstSave.promise);
    const { result } = render(50);
    await waitFor(() => expect(result.current.prefs).toEqual({ view: "table" }));

    act(() => result.current.save({ view: "board" }));
    // Shown at once, while the save still waits in the debounce window...
    expect(result.current.prefs).toEqual({ view: "board" });
    expect(cached()).toEqual({ view: "table" });
    expect(h.save).not.toHaveBeenCalled();

    // ...then the save patches the cache on its way out.
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save).toHaveBeenCalledWith({ ...h.KEY, prefs: { view: "board" } });
    await waitFor(() => expect(cached()).toEqual({ view: "board" }));

    await act(async () => firstSave.resolve({}));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(cached()).toEqual({ view: "board" });
    expect(result.current.prefs).toEqual({ view: "board" });
  });

  test("a save that lands while a later one is queued leaves the later value in place", async () => {
    h.read.mockResolvedValue({ view: "table" });
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    h.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = render();
    await waitFor(() => expect(result.current.prefs).toEqual({ view: "table" }));

    act(() => result.current.save({ view: "board" }));
    act(() => result.current.save({ view: "list" }));
    await waitFor(() => expect(cached()).toEqual({ view: "list" }));

    await act(async () => first.resolve({}));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(cached()).toEqual({ view: "list" });
    expect(result.current.prefs).toEqual({ view: "list" });

    await act(async () => second.resolve({}));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(cached()).toEqual({ view: "list" });
  });

  test("saves go out one at a time, in the order they were made", async () => {
    h.read.mockResolvedValue({ view: "table" });
    const first = deferred<unknown>();
    h.save.mockReturnValueOnce(first.promise).mockResolvedValue({});
    const { result } = render();
    await waitFor(() => expect(result.current.prefs).toEqual({ view: "table" }));

    act(() => result.current.save({ view: "board" }));
    act(() => result.current.save({ groupBy: "status" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    // Both show at once; the second waits for the first to land.
    expect(result.current.prefs).toEqual({ view: "board", groupBy: "status" });
    expect(h.save).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve({}));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(h.save).toHaveBeenLastCalledWith({ ...h.KEY, prefs: { groupBy: "status" } });
  });

  test("two saves made while the first read is in flight both outlive it", async () => {
    const firstRead = deferred<Prefs>();
    h.read.mockReturnValueOnce(firstRead.promise);
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    h.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = render();

    act(() => result.current.save({ view: "board" }));
    act(() => result.current.save({ groupBy: "status" }));
    // The first lands while the second is still to come back.
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    await act(async () => first.resolve({}));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({}));

    // The read was built before either save committed.
    await act(async () => firstRead.resolve({ view: "table", groupBy: "none", sortDir: "asc" }));

    await waitFor(() => expect(cached()).toEqual({ view: "board", groupBy: "status", sortDir: "asc" }));
    expect(result.current.prefs).toEqual({ view: "board", groupBy: "status", sortDir: "asc" });
  });

  test("a save that lands while an earlier one waits on the read keeps its value", async () => {
    const firstRead = deferred<Prefs>();
    h.read.mockReturnValueOnce(firstRead.promise);
    h.save.mockResolvedValue({});
    const { result } = render();

    // The first save lands while the read is still out...
    act(() => result.current.save({ view: "board" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    // ...and so does a second, made after it.
    act(() => result.current.save({ groupBy: "status" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    await act(async () => Promise.resolve());

    await act(async () => firstRead.resolve({ view: "table", groupBy: "none" }));

    await waitFor(() => expect(cached()).toEqual({ view: "board", groupBy: "status" }));
    expect(result.current.prefs).toEqual({ view: "board", groupBy: "status" });
  });

  test("an older save never overwrites a newer value for the same pref", async () => {
    // Insights, slow first read: board, then straight back to list.
    const firstRead = deferred<Prefs>();
    h.read.mockReturnValueOnce(firstRead.promise);
    h.save.mockResolvedValue({});
    const { result } = render();

    act(() => result.current.save({ view: "board" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    act(() => result.current.save({ view: "list" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    await act(async () => Promise.resolve());

    await act(async () => firstRead.resolve({ view: "list" }));

    await waitFor(() => expect(result.current.prefs).toEqual({ view: "list" }));
    expect(cached()).toEqual({ view: "list" });
  });

  test("a failed save drops the cached prefs and reads them again", async () => {
    h.read.mockResolvedValue({ view: "table" });
    const firstSave = deferred<unknown>();
    h.save.mockReturnValueOnce(firstSave.promise);
    const { result } = render();
    await waitFor(() => expect(result.current.prefs).toEqual({ view: "table" }));

    act(() => result.current.save({ view: "board" }));
    await waitFor(() => expect(cached()).toEqual({ view: "board" }));

    await act(async () => firstSave.reject(new Error("nope")));
    await waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(cached()).toEqual({ view: "table" });
    expect(result.current.prefs).toEqual({ view: "table" });
  });

  test("the reconcile still runs after the page has unmounted", async () => {
    const firstRead = deferred<Prefs>();
    h.read.mockReturnValueOnce(firstRead.promise);
    h.save.mockResolvedValue({});
    const { result, unmount } = render();

    act(() => result.current.save({ view: "board" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    // A tab switch inside the window: the page is gone, the read is not.
    unmount();

    await act(async () => firstRead.resolve({ view: "table" }));
    await waitFor(() => expect(cached()).toEqual({ view: "board" }));
  });
});
